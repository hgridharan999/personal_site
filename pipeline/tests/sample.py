"""A small, fully built manifest: the contract fixture and the upload tests' input."""

from __future__ import annotations

import numpy as np
from helpers import START, TRAILHEAD

from flyover.config import Playback
from flyover.coverage import compute_coverage
from flyover.geo import from_local_m
from flyover.manifest import Manifest, build_manifest
from flyover.photos import ExportedPhoto
from flyover.stats import compute_stats, detect_stops
from flyover.track import Resampled


def sample_manifest() -> Manifest:
    """A small out-and-back with one stop and one photo, built through the real builder."""
    n = 41
    north = np.concatenate([np.linspace(0, 100, 21), np.linspace(95, 0, 20)])
    lat, lon = from_local_m(np.zeros(n), north, *TRAILHEAD)
    dist = np.arange(n) * 5.0
    t = dist / 1.2
    t[12:] += 300  # a 5-minute stop between points 11 and 12
    ele = 3400 + north * 0.3
    track = Resampled(start=START, t=t, lat=lat, lon=lon, dist=dist)
    stops, moving = detect_stops(t, dist)
    stats = compute_stats(t, dist, ele, moving)
    radii = {18: 50, 17: 100, 16: 200, 15: 400, 14: 800, 13: 1600}
    return build_manifest(
        slug="sample",
        name="Sample Peak",
        timezone="America/Denver",
        playback=Playback(),
        track=track,
        ele=ele,
        stops=stops,
        moving=moving,
        stats=stats,
        coverage=compute_coverage(lat, lon, radii, 3000),
        naip_year=2023,
        photos=[ExportedPhoto("photos/0123456789ab.webp", float(t[20]), 20, 1600, 1200, "Summit")],
    )
