import numpy as np
import pytest
from helpers import TRAILHEAD

from flyover.coverage import (
    chunk_tiles,
    compute_coverage,
    dem_coverage,
    from_rows,
    tile_centers_lonlat,
    tiles_lonlat_bbox,
    tiles_near,
    to_rows,
    with_ancestors,
)
from flyover.geo import from_local_m, haversine_m, merc_to_lonlat, tile_bounds

LAT = np.array([TRAILHEAD[0]])
LON = np.array([TRAILHEAD[1]])


def _rect_distance_m(z, x, y, lat, lon):
    """Ground distance from (lat, lon) to the nearest point of a tile, sampled finely."""
    b = tile_bounds(z, x, y)
    xs = np.linspace(b.minx, b.maxx, 60)
    ys = np.linspace(b.miny, b.maxy, 60)
    gx, gy = np.meshgrid(xs, ys)
    glon, glat = merc_to_lonlat(gx, gy)
    return float(haversine_m(lat, lon, glat, glon).min())


def test_tiles_near_matches_brute_force():
    z, radius = 17, 600.0
    got = tiles_near(z, LAT, LON, radius)
    xs = {x for x, _ in got}
    ys = {y for _, y in got}
    for x in range(min(xs) - 2, max(xs) + 3):
        for y in range(min(ys) - 2, max(ys) + 3):
            d = _rect_distance_m(z, x, y, LAT[0], LON[0])
            if d < radius - 5:
                assert (x, y) in got, (x, y, d)
            if d > radius + 5:
                assert (x, y) not in got, (x, y, d)


def test_corridor_follows_the_track():
    lat, lon = from_local_m(np.zeros(401), np.linspace(0, 4000, 401), *TRAILHEAD)
    tiles = tiles_near(18, lat, lon, 500)
    width = len({x for x, _ in tiles})
    height = len({y for _, y in tiles})
    assert height > 2 * width  # a north-south track makes a tall, narrow corridor


def test_ancestors_make_the_quadtree_connected():
    cov = with_ancestors({12: {(10, 10)}, 14: {(45, 41)}}, 10)
    assert cov[13] == {(22, 20)} and cov[12] == {(10, 10), (11, 10)} and cov[11] == {(5, 5)}
    assert cov[10] == {(2, 2)}


def test_compute_coverage_shape():
    lat, lon = from_local_m(np.zeros(201), np.linspace(0, 2000, 201), *TRAILHEAD)
    cov = compute_coverage(lat, lon, {18: 100, 17: 200, 16: 400, 15: 800, 14: 1600, 13: 3200}, 5000)
    assert sorted(cov) == list(range(8, 19))
    for z in range(9, 19):
        parents = {(x // 2, y // 2) for x, y in cov[z]}
        assert parents <= cov[z - 1], z
    assert max(dem_coverage(cov)) == 17


def test_rows_round_trip_and_compress_runs():
    tiles = {(5, 1), (6, 1), (7, 1), (9, 1), (3, 2)}
    assert to_rows(tiles) == [[1, 5, 7], [1, 9, 9], [2, 3, 3]]
    assert from_rows(to_rows(tiles)) == tiles


def test_lonlat_helpers():
    tiles = {(26903, 49906), (26904, 49906)}
    west, south, east, north = tiles_lonlat_bbox(17, tiles)
    lon, lat = tile_centers_lonlat(17, tiles)
    assert west < lon.min() < lon.max() < east and south < lat.min() <= lat.max() < north
    assert east - west == pytest.approx(2 * 360 / 2**17)


def test_chunk_tiles_groups_aligned_blocks():
    groups = chunk_tiles({(0, 0), (15, 15), (16, 0), (31, 1), (16, 16)}, 16)
    assert groups == [[(0, 0), (15, 15)], [(16, 0), (31, 1)], [(16, 16)]]
