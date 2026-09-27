"""Track builders shared by the pipeline tests. No test touches the network."""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

from flyover.geo import from_local_m

START = datetime(2026, 7, 12, 11, 0, 0, tzinfo=UTC)
TRAILHEAD = (39.3780, -106.0880)  # (lat, lon), near Quandary's trailhead

Point = tuple[datetime, float, float]


def synth_track(segments: list[tuple[str, float, float, float]], seed: int = 0) -> list[Point]:
    """1 Hz points in local meters around TRAILHEAD.

    ("walk", seconds, speed_mps, heading_deg) walks straight (0 = north, 90 = east).
    ("stop", seconds, jitter_m, 0) stands still with uniform GPS jitter.
    """
    rng = np.random.default_rng(seed)
    x = y = 0.0
    t = START
    out = [(t, *TRAILHEAD)]
    for kind, seconds, a, b in segments:
        for _ in range(int(seconds)):
            t += timedelta(seconds=1)
            if kind == "walk":
                x += a * math.sin(math.radians(b))
                y += a * math.cos(math.radians(b))
                px, py = x, y
            else:
                px, py = x + rng.uniform(-a, a), y + rng.uniform(-a, a)
            lat, lon = from_local_m(px, py, *TRAILHEAD)
            out.append((t, float(lat), float(lon)))
    return out


def write_gpx(path: Path, points: list[Point]) -> Path:
    rows = "\n".join(
        f'<trkpt lat="{lat:.7f}" lon="{lon:.7f}"><time>{t:%Y-%m-%dT%H:%M:%SZ}</time></trkpt>'
        for t, lat, lon in points
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">'
        f"<trk><trkseg>\n{rows}\n</trkseg></trk></gpx>\n",
        encoding="utf-8",
    )
    return path
