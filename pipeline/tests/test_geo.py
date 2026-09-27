import importlib
import os

import numpy as np
import pytest

import flyover
from flyover.geo import (
    MERC_HALF,
    Bounds,
    block_bounds,
    from_local_m,
    ground_resolution,
    haversine_m,
    lonlat_to_merc,
    lonlat_to_tile,
    merc_to_lonlat,
    merc_to_tile,
    tile_bounds,
    to_local_m,
)

QUANDARY = (-106.1065, 39.3972)  # lon, lat


def test_import_drops_foreign_proj_and_gdal_paths(monkeypatch):
    monkeypatch.setenv("PROJ_LIB", r"C:\Program Files\PostgreSQL\18\share\contrib\postgis-3.6\proj")
    monkeypatch.setenv("GDAL_DATA", r"C:\Program Files\PostgreSQL\18\gdal-data")
    importlib.reload(flyover)
    assert "PROJ_LIB" not in os.environ
    assert "GDAL_DATA" not in os.environ


def test_rasterio_resolves_epsg_codes():
    from rasterio.crs import CRS

    assert CRS.from_epsg(26913).to_epsg() == 26913


def test_world_tile_is_the_whole_mercator_square():
    assert tile_bounds(0, 0, 0) == Bounds(-MERC_HALF, -MERC_HALF, MERC_HALF, MERC_HALF)


def test_quandary_summit_tiles():
    assert lonlat_to_tile(8, *QUANDARY) == (52, 97)
    assert lonlat_to_tile(17, *QUANDARY) == (26903, 49906)


def test_tile_contains_the_point_it_was_computed_from():
    mx, my = lonlat_to_merc(*QUANDARY)
    b = tile_bounds(17, *merc_to_tile(17, float(mx), float(my)))
    assert b.minx <= mx < b.maxx and b.miny < my <= b.maxy


def test_block_bounds_spans_both_corner_tiles():
    b = block_bounds(10, 3, 5, 4, 7)
    assert b.minx == tile_bounds(10, 3, 5).minx and b.maxy == tile_bounds(10, 3, 5).maxy
    assert b.maxx == tile_bounds(10, 4, 7).maxx and b.miny == tile_bounds(10, 4, 7).miny


def test_merc_round_trip():
    mx, my = lonlat_to_merc(*QUANDARY)
    lon, lat = merc_to_lonlat(mx, my)
    assert lon == pytest.approx(QUANDARY[0], abs=1e-9)
    assert lat == pytest.approx(QUANDARY[1], abs=1e-9)


def test_ground_resolution_at_z17_is_under_a_meter_in_colorado():
    assert ground_resolution(17, QUANDARY[1]) == pytest.approx(0.9226, abs=1e-3)


def test_one_degree_of_latitude():
    assert float(haversine_m(39.0, -106.0, 40.0, -106.0)) == pytest.approx(111_195, rel=1e-4)


def test_local_meters_round_trip():
    x, y = to_local_m(np.array([39.40, 39.41]), np.array([-106.10, -106.09]), 39.40, -106.10)
    lat, lon = from_local_m(x, y, 39.40, -106.10)
    assert np.allclose(lat, [39.40, 39.41]) and np.allclose(lon, [-106.10, -106.09])
    assert x[1] == pytest.approx(859.2, abs=0.5)  # 0.01 deg of longitude at 39.4 N
