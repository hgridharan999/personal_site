"""Web Mercator tile math and small geodesy helpers shared by every stage."""

from __future__ import annotations

import math
from typing import NamedTuple

import numpy as np
import numpy.typing as npt

MERC_HALF = 20037508.342789244  # half the width of the Web Mercator world, meters
MERC_R = 6378137.0  # Web Mercator sphere radius, meters
EARTH_R = 6371008.8  # mean Earth radius for ground distances, meters
TILE_PX = 256

FloatArray = npt.NDArray[np.float64]
_DEG_M = math.radians(1) * EARTH_R  # meters per degree of latitude


class Bounds(NamedTuple):
    """An axis-aligned box in EPSG:3857 meters."""

    minx: float
    miny: float
    maxx: float
    maxy: float

    def expand(self, d: float) -> Bounds:
        return Bounds(self.minx - d, self.miny - d, self.maxx + d, self.maxy + d)


def lonlat_to_merc(lon: npt.ArrayLike, lat: npt.ArrayLike) -> tuple[FloatArray, FloatArray]:
    x = np.radians(np.asarray(lon, dtype=np.float64)) * MERC_R
    y = np.log(np.tan(np.pi / 4 + np.radians(np.asarray(lat, dtype=np.float64)) / 2)) * MERC_R
    return x, y


def merc_to_lonlat(x: npt.ArrayLike, y: npt.ArrayLike) -> tuple[FloatArray, FloatArray]:
    lon = np.degrees(np.asarray(x, dtype=np.float64) / MERC_R)
    lat = np.degrees(2 * np.arctan(np.exp(np.asarray(y, dtype=np.float64) / MERC_R)) - np.pi / 2)
    return lon, lat


def tile_size_m(z: int) -> float:
    """Width of one tile at zoom z, in Web Mercator meters."""
    return 2 * MERC_HALF / 2**z


def tile_bounds(z: int, x: int, y: int) -> Bounds:
    s = tile_size_m(z)
    minx = -MERC_HALF + x * s
    maxy = MERC_HALF - y * s
    return Bounds(minx, maxy - s, minx + s, maxy)


def block_bounds(z: int, x0: int, y0: int, x1: int, y1: int) -> Bounds:
    """Bounds of the block of tiles from (x0, y0) to (x1, y1) inclusive. y grows southward."""
    top_left = tile_bounds(z, x0, y0)
    bottom_right = tile_bounds(z, x1, y1)
    return Bounds(top_left.minx, bottom_right.miny, bottom_right.maxx, top_left.maxy)


def merc_to_tile(z: int, mx: float, my: float) -> tuple[int, int]:
    s = tile_size_m(z)
    last = 2**z - 1
    x = math.floor((mx + MERC_HALF) / s)
    y = math.floor((MERC_HALF - my) / s)
    return min(max(x, 0), last), min(max(y, 0), last)


def lonlat_to_tile(z: int, lon: float, lat: float) -> tuple[int, int]:
    mx, my = lonlat_to_merc(lon, lat)
    return merc_to_tile(z, float(mx), float(my))


def ground_resolution(z: int, lat: float) -> float:
    """Meters on the ground per tile pixel at latitude `lat`."""
    return math.cos(math.radians(lat)) * tile_size_m(z) / TILE_PX


def haversine_m(
    lat1: npt.ArrayLike, lon1: npt.ArrayLike, lat2: npt.ArrayLike, lon2: npt.ArrayLike
) -> FloatArray:
    p1 = np.radians(np.asarray(lat1, dtype=np.float64))
    p2 = np.radians(np.asarray(lat2, dtype=np.float64))
    dlon = np.radians(np.asarray(lon2, dtype=np.float64) - np.asarray(lon1, dtype=np.float64))
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_R * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def to_local_m(
    lat: npt.ArrayLike, lon: npt.ArrayLike, lat0: float, lon0: float
) -> tuple[FloatArray, FloatArray]:
    """Equirectangular east/north meters around (lat0, lon0); plenty accurate across one hike."""
    x = (np.asarray(lon, dtype=np.float64) - lon0) * _DEG_M * math.cos(math.radians(lat0))
    y = (np.asarray(lat, dtype=np.float64) - lat0) * _DEG_M
    return x, y


def from_local_m(
    x: npt.ArrayLike, y: npt.ArrayLike, lat0: float, lon0: float
) -> tuple[FloatArray, FloatArray]:
    """Inverse of to_local_m. Returns (lat, lon)."""
    lat = lat0 + np.asarray(y, dtype=np.float64) / _DEG_M
    lon = lon0 + np.asarray(x, dtype=np.float64) / (_DEG_M * math.cos(math.radians(lat0)))
    return lat, lon
