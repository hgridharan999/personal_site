import numpy as np
import pytest
from helpers import synth_track

from flyover.stats import compute_stats, detect_stops, elevation_gain
from flyover.track import RawPoint, decimate, smooth_and_resample


def test_detects_a_long_slow_run_as_one_stop():
    t = np.array([0, 5, 10, 310, 315, 320], dtype=float)
    dist = np.array([0, 5, 10, 15, 20, 25], dtype=float)
    stops, moving = detect_stops(t, dist)
    assert [(s.start_idx, s.end_idx, s.seconds) for s in stops] == [(2, 3, 300.0)]
    assert moving.tolist() == [1, 1, 1, 0, 1, 1]


def test_short_pauses_are_not_stops():
    t = np.array([0, 5, 40, 45], dtype=float)  # 35 s at 5 m / 35 s = 0.14 m/s
    stops, moving = detect_stops(t, np.array([0, 5, 10, 15], dtype=float))
    assert stops == [] and moving.tolist() == [1, 1, 1, 1]


def test_consecutive_slow_segments_merge():
    t = np.array([0, 40, 80, 85], dtype=float)
    stops, moving = detect_stops(t, np.array([0, 5, 10, 15], dtype=float))
    assert [(s.start_idx, s.end_idx, s.seconds) for s in stops] == [(0, 2, 80.0)]
    assert moving.tolist() == [1, 0, 0, 1]


def test_stop_found_end_to_end_from_jittery_gps():
    pts = [
        RawPoint(*p)
        for p in synth_track([("walk", 300, 1.2, 0), ("stop", 540, 1.5, 0), ("walk", 300, 1.2, 0)])
    ]
    r = smooth_and_resample(decimate(pts))
    stops, _ = detect_stops(r.t, r.dist)
    assert len(stops) == 1 and stops[0].seconds == pytest.approx(540, abs=20)


def test_elevation_gain_ignores_noise_below_threshold():
    noisy = np.array([100, 101, 100, 102, 100, 101, 100], dtype=float)
    assert elevation_gain(noisy) == 0.0
    climb = np.array([100, 101, 102, 103, 104, 110, 108, 115], dtype=float)
    assert elevation_gain(climb) == pytest.approx(15.0)


def test_compute_stats():
    t = np.array([0, 600, 1200, 1800, 2400, 3000], dtype=float)
    dist = np.array([0, 500, 1000, 1500, 2000, 2500], dtype=float)
    ele = np.array([3000, 3100, 3200, 3150, 3050, 3000], dtype=float)
    moving = np.array([1, 1, 1, 1, 1, 1], dtype=np.int8)
    s = compute_stats(t, dist, ele, moving)
    assert s.distance_m == 2500 and s.total_s == 3000 and s.moving_s == 3000
    assert s.summit_idx == 2 and s.gain_m == pytest.approx(200)
    assert s.ascent_rate_m_per_h == pytest.approx(200 / (1200 / 3600))


def test_ascent_rate_excludes_stopped_time():
    t = np.array([0, 600, 1200, 1800], dtype=float)
    ele = np.array([3000, 3100, 3100, 3200], dtype=float)
    moving = np.array([1, 1, 0, 1], dtype=np.int8)
    s = compute_stats(t, np.array([0, 500, 505, 1000.0]), ele, moving)
    assert s.moving_s == 1200 and s.ascent_rate_m_per_h == pytest.approx(200 / (1200 / 3600))
