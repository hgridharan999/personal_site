"""GPX parsing and track cleanup, up to an evenly spaced, smoothed path."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import gpxpy
import numpy as np
from scipy.signal import savgol_filter

from flyover.geo import FloatArray, from_local_m, haversine_m, to_local_m


class TrackError(Exception):
    """The GPX can't be turned into a usable track."""


@dataclass(frozen=True)
class RawPoint:
    t: datetime  # timezone-aware, UTC
    lat: float
    lon: float


@dataclass(frozen=True)
class Resampled:
    start: datetime  # UTC time of the first point
    t: FloatArray  # seconds since start, non-decreasing
    lat: FloatArray
    lon: FloatArray
    dist: FloatArray  # cumulative meters along the smoothed path


def parse_gpx(path: Path) -> list[RawPoint]:
    with path.open(encoding="utf-8-sig") as f:
        gpx = gpxpy.parse(f)
    points = [
        RawPoint(_as_utc(p.time), p.latitude, p.longitude)
        for track in gpx.tracks
        for segment in track.segments
        for p in segment.points
        if p.time is not None
    ]
    if len(points) < 2:
        raise TrackError(f"{path} has fewer than 2 timestamped track points")
    return points


def _as_utc(t: datetime) -> datetime:
    # GPX times are UTC by definition, but gpxpy leaves some without tzinfo
    return t.replace(tzinfo=UTC) if t.tzinfo is None else t.astimezone(UTC)


def _dist(a: RawPoint, b: RawPoint) -> float:
    return float(haversine_m(a.lat, a.lon, b.lat, b.lon))


def _speed(a: RawPoint, b: RawPoint) -> float:
    dt = (b.t - a.t).total_seconds()
    return math.inf if dt <= 0 else _dist(a, b) / dt


def _spike_length(
    before: RawPoint, pts: list[RawPoint], i: int, max_speed: float, max_spike: int
) -> int:
    """Length of the spike starting at pts[i], or 0 if pts[i] starts real movement."""
    for k in range(1, max_spike + 1):
        after = i + k  # first point past a k-point run
        if after >= len(pts):
            break
        leaves_fast = _speed(pts[after - 1], pts[after]) > max_speed
        if leaves_fast and _speed(before, pts[after]) <= max_speed:
            return k
    return 0


def clean(points: list[RawPoint], max_speed: float = 4.0, max_spike: int = 2) -> list[RawPoint]:
    """Sort by time, drop duplicate timestamps, and drop GPS spikes.

    A spike is a run of at most `max_spike` points entered and left faster than `max_speed`
    m/s, while the points on either side are within plausible reach of each other. A fast
    run that isn't left just as fast is real movement and is kept.
    """
    ordered = sorted(points, key=lambda p: p.t)
    unique = [ordered[0]]
    for p in ordered[1:]:
        if p.t > unique[-1].t:
            unique.append(p)
    kept = [unique[0]]
    i = 1
    while i < len(unique):
        if _speed(kept[-1], unique[i]) > max_speed:
            spike = _spike_length(kept[-1], unique, i, max_speed, max_spike)
            if spike:
                i += spike
                continue
        kept.append(unique[i])
        i += 1
    return kept


def trim(points: list[RawPoint], start_m: float, end_m: float) -> list[RawPoint]:
    """Drop the first `start_m` and last `end_m` meters of the track (privacy)."""
    if start_m <= 0 and end_m <= 0:
        return points
    lat = np.array([p.lat for p in points])
    lon = np.array([p.lon for p in points])
    cum = np.concatenate([[0.0], np.cumsum(haversine_m(lat[:-1], lon[:-1], lat[1:], lon[1:]))])
    keep = (cum >= start_m) & (cum <= cum[-1] - end_m)
    out = [p for p, k in zip(points, keep, strict=True) if k]
    if len(out) < 2:
        raise TrackError(
            f"Trimming {start_m:g} m + {end_m:g} m leaves under 2 points of a {cum[-1]:.0f} m track"
        )
    return out


def decimate(points: list[RawPoint], min_step_m: float = 4.0) -> list[RawPoint]:
    """Keep a point only once it's at least `min_step_m` from the last kept one.

    Standing still, GPS jitter wanders a few meters every second; summed over a ten-minute
    break that's hundreds of meters of fake distance. Dropping sub-step moves turns a stop
    into one long time gap instead, which stop detection can see.
    """
    kept = [points[0]]
    for p in points[1:-1]:
        if _dist(kept[-1], p) >= min_step_m:
            kept.append(p)
    kept.append(points[-1])
    return kept


def smooth_and_resample(
    points: list[RawPoint], spacing_m: float = 5.0, window: int = 15, polyorder: int = 2
) -> Resampled:
    """Savitzky-Golay-smooth the horizontal path, then resample every `spacing_m` meters."""
    lat = np.array([p.lat for p in points])
    lon = np.array([p.lon for p in points])
    t = np.array([(p.t - points[0].t).total_seconds() for p in points])
    lat0, lon0 = float(lat[0]), float(lon[0])
    x, y = to_local_m(lat, lon, lat0, lon0)
    n = len(points)
    win = min(window, n if n % 2 == 1 else n - 1)
    if win > polyorder:
        x = savgol_filter(x, win, polyorder)
        y = savgol_filter(y, win, polyorder)
    cum = np.concatenate([[0.0], np.cumsum(np.hypot(np.diff(x), np.diff(y)))])
    # np.interp needs strictly increasing x; a zero-length step keeps its first time
    cum_u, first = np.unique(cum, return_index=True)
    total = float(cum_u[-1])
    if total < spacing_m:
        raise TrackError(f"Track is only {total:.1f} m long")
    targets = np.arange(0.0, total, spacing_m)
    if total - targets[-1] > 1e-6:
        targets = np.append(targets, total)
    rx = np.interp(targets, cum_u, x[first])
    ry = np.interp(targets, cum_u, y[first])
    rt = np.interp(targets, cum_u, t[first])
    rlat, rlon = from_local_m(rx, ry, lat0, lon0)
    return Resampled(start=points[0].t, t=rt, lat=rlat, lon=rlon, dist=targets)
