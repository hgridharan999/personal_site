"""Stop detection and the summary numbers shown in the viewer's stats panel."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from flyover.geo import FloatArray


@dataclass(frozen=True)
class Stop:
    start_idx: int  # last point before the stop
    end_idx: int  # first point after the stop
    seconds: float


@dataclass(frozen=True)
class TrackStats:
    distance_m: float
    gain_m: float
    moving_s: float
    total_s: float
    summit_idx: int
    ascent_rate_m_per_h: float  # gain up to the summit / moving time up to the summit


def detect_stops(
    t: FloatArray, dist: FloatArray, min_speed: float = 0.3, min_duration_s: float = 60.0
) -> tuple[list[Stop], npt.NDArray[np.int8]]:
    """Runs of segments slower than `min_speed` m/s lasting at least `min_duration_s`.

    Returns the stops and a per-point `moving` flag: moving[i] is 0 when the segment
    ending at point i is part of a stop.
    """
    dt = np.diff(t)
    dd = np.diff(dist)
    with np.errstate(divide="ignore", invalid="ignore"):
        speed = np.where(dt > 0, dd / dt, np.inf)
    slow = speed < min_speed
    stops: list[Stop] = []
    moving = np.ones(len(t), dtype=np.int8)
    i = 0
    while i < len(slow):
        if not slow[i]:
            i += 1
            continue
        j = i
        while j + 1 < len(slow) and slow[j + 1]:
            j += 1
        seconds = float(t[j + 1] - t[i])
        if seconds >= min_duration_s:
            stops.append(Stop(start_idx=i, end_idx=j + 1, seconds=seconds))
            moving[i + 1 : j + 2] = 0
        i = j + 1
    return stops, moving


def elevation_gain(ele: FloatArray, threshold_m: float = 3.0) -> float:
    """Sum of climbs, counting a rise only once it exceeds `threshold_m` (ignores noise)."""
    gain = 0.0
    ref = float(ele[0])
    for h in ele[1:]:
        h = float(h)
        if h - ref >= threshold_m:
            gain += h - ref
            ref = h
        elif ref - h >= threshold_m:
            ref = h
    return gain


def compute_stats(
    t: FloatArray, dist: FloatArray, ele: FloatArray, moving: npt.NDArray[np.int8]
) -> TrackStats:
    dt = np.diff(t)
    moving_seg = moving[1:] == 1
    summit_idx = int(np.argmax(ele))
    climb_h = float(dt[:summit_idx][moving_seg[:summit_idx]].sum()) / 3600
    climb_gain = elevation_gain(ele[: summit_idx + 1])
    return TrackStats(
        distance_m=float(dist[-1]),
        gain_m=elevation_gain(ele),
        moving_s=float(dt[moving_seg].sum()),
        total_s=float(t[-1] - t[0]),
        summit_idx=summit_idx,
        ascent_rate_m_per_h=climb_gain / climb_h if climb_h > 0 else 0.0,
    )
