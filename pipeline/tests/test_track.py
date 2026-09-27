from datetime import timedelta
from itertools import pairwise

import numpy as np
import pytest
from helpers import START, TRAILHEAD, synth_track, write_gpx

from flyover.geo import haversine_m
from flyover.track import (
    RawPoint,
    TrackError,
    clean,
    decimate,
    parse_gpx,
    smooth_and_resample,
    trim,
)


def raw(points):
    return [RawPoint(t, lat, lon) for t, lat, lon in points]


def test_parse_gpx_reads_utc_points(tmp_path):
    pts = synth_track([("walk", 10, 1.0, 0)])
    parsed = parse_gpx(write_gpx(tmp_path / "t.gpx", pts))
    assert len(parsed) == 11
    assert parsed[0].t == START and parsed[0].t.utcoffset() == timedelta(0)
    assert parsed[0].lat == pytest.approx(TRAILHEAD[0], abs=1e-7)


def test_parse_gpx_needs_two_timed_points(tmp_path):
    with pytest.raises(TrackError):
        parse_gpx(write_gpx(tmp_path / "t.gpx", synth_track([])))


def test_clean_drops_duplicate_timestamps_and_sorts():
    pts = raw(synth_track([("walk", 5, 1.0, 0)]))
    shuffled = [pts[3], pts[0], pts[1], pts[1], pts[2], pts[4], pts[5]]
    assert clean(shuffled) == pts


def test_clean_drops_a_two_point_spike():
    pts = raw(synth_track([("walk", 20, 1.0, 0)]))
    spiked = list(pts)
    for i in (8, 9):  # teleport 300 m east for two seconds, then come back
        p = pts[i]
        spiked[i] = RawPoint(p.t, p.lat, p.lon + 0.0035)
    kept = clean(spiked)
    assert len(kept) == len(pts) - 2
    assert all(abs(p.lon - TRAILHEAD[1]) < 1e-4 for p in kept)


def test_clean_keeps_sustained_fast_movement():
    # 30 s at 6 m/s is fast for a hiker but is real movement, not a spike
    pts = raw(synth_track([("walk", 10, 1.0, 0), ("walk", 30, 6.0, 0), ("walk", 10, 1.0, 0)]))
    assert len(clean(pts)) == len(pts)


def test_trim_removes_distance_from_both_ends():
    pts = raw(synth_track([("walk", 1000, 1.0, 0)]))  # 1 km north
    out = trim(pts, 100, 200)
    first = float(haversine_m(pts[0].lat, pts[0].lon, out[0].lat, out[0].lon))
    last = float(haversine_m(pts[-1].lat, pts[-1].lon, out[-1].lat, out[-1].lon))
    assert first == pytest.approx(100, abs=1.5) and last == pytest.approx(200, abs=1.5)


def test_trim_everything_is_an_error():
    with pytest.raises(TrackError):
        trim(raw(synth_track([("walk", 100, 1.0, 0)])), 60, 60)


def test_decimate_collapses_a_jittery_stop():
    pts = raw(synth_track([("walk", 60, 1.2, 0), ("stop", 600, 1.5, 0), ("walk", 60, 1.2, 0)]))
    kept = decimate(pts)
    assert len(kept) < 50
    gaps = [(b.t - a.t).total_seconds() for a, b in pairwise(kept)]
    assert max(gaps) >= 590  # the stop survives as one long time gap


def test_resample_spacing_and_monotonic_time():
    pts = decimate(raw(synth_track([("walk", 600, 1.2, 0), ("walk", 600, 1.2, 90)])))
    r = smooth_and_resample(pts)
    steps = np.diff(r.dist)
    assert np.allclose(steps[:-1], 5.0) and 0 < steps[-1] <= 5.0
    assert np.all(np.diff(r.t) >= 0)
    assert r.t[-1] == pytest.approx(1200, abs=1)
    assert r.dist[-1] == pytest.approx(1440, rel=0.02)  # the smoothed corner is a bit shorter


def test_resample_keeps_walking_pace():
    r = smooth_and_resample(decimate(raw(synth_track([("walk", 900, 1.2, 0)]))))
    pace = np.diff(r.dist) / np.diff(r.t)
    assert np.median(pace) == pytest.approx(1.2, rel=0.02)


def test_resample_rejects_a_stationary_track():
    with pytest.raises(TrackError, match="long"):
        smooth_and_resample(raw(synth_track([("walk", 2, 1.0, 0)])))
