"""Which tiles exist: sharp near the trail, coarser with distance, a horizon ring far out."""

from __future__ import annotations

from collections import defaultdict

import numpy as np

from flyover.geo import (
    MERC_HALF,
    FloatArray,
    block_bounds,
    lonlat_to_merc,
    merc_to_lonlat,
    merc_to_tile,
    tile_size_m,
)

Tile = tuple[int, int]
Coverage = dict[int, set[Tile]]

# Ground radius around the track for each zoom. Halving per zoom keeps texel size roughly
# proportional to camera distance: at ~1.5 px per texel, 0.46 m texels (z18) hold up to
# about 500 m away, 0.92 m (z17) to 1 km, and so on.
CORRIDOR_RADII_M: dict[int, float] = {
    18: 500.0,
    17: 1_000.0,
    16: 2_000.0,
    15: 4_000.0,
    14: 8_000.0,
    13: 16_000.0,
}
RING_RADIUS_M = 40_000.0  # horizon ring around the track's bounding-box center
RING_ZOOMS = range(8, 13)
DEM_MAX_ZOOM = 17  # z18 imagery drapes over its z17 parent's heights
IMG_MAX_ZOOM = 18
_POINT_CHUNK = 256


def tiles_near(z: int, lat: FloatArray, lon: FloatArray, radius_m: float) -> set[Tile]:
    """Tiles at zoom z whose footprint comes within `radius_m` (ground) of any point."""
    mx, my = lonlat_to_merc(lon, lat)
    # one ground meter spans 1/cos(lat) Web Mercator meters
    r = radius_m / np.cos(np.radians(np.asarray(lat, dtype=np.float64)))
    rmax = float(r.max())
    x0, y0 = merc_to_tile(z, float(mx.min()) - rmax, float(my.max()) + rmax)
    x1, y1 = merc_to_tile(z, float(mx.max()) + rmax, float(my.min()) - rmax)
    tx, ty = (a.ravel() for a in np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1)))
    s = tile_size_m(z)
    minx = (-MERC_HALF + tx * s)[:, None]
    maxy = (MERC_HALF - ty * s)[:, None]
    maxx, miny = minx + s, maxy - s
    near = np.zeros(len(tx), dtype=bool)
    for i in range(0, len(mx), _POINT_CHUNK):
        px = mx[None, i : i + _POINT_CHUNK]
        py = my[None, i : i + _POINT_CHUNK]
        dx = np.maximum(np.maximum(minx - px, 0.0), px - maxx)
        dy = np.maximum(np.maximum(miny - py, 0.0), py - maxy)
        near |= (dx * dx + dy * dy <= r[None, i : i + _POINT_CHUNK] ** 2).any(axis=1)
    return {(int(x), int(y)) for x, y in zip(tx[near], ty[near], strict=True)}


def with_ancestors(cov: Coverage, min_zoom: int) -> Coverage:
    """Add every covered tile's parents, so the viewer's quadtree is always connected."""
    out = {z: set(tiles) for z, tiles in cov.items()}
    for z in range(max(out), min_zoom, -1):
        out.setdefault(z - 1, set()).update((x // 2, y // 2) for x, y in out.get(z, set()))
    return out


def compute_coverage(
    lat: FloatArray,
    lon: FloatArray,
    corridor_radii_m: dict[int, float] = CORRIDOR_RADII_M,
    ring_radius_m: float = RING_RADIUS_M,
) -> Coverage:
    cov: Coverage = {z: tiles_near(z, lat, lon, r) for z, r in corridor_radii_m.items()}
    center_lat = np.array([(lat.min() + lat.max()) / 2])
    center_lon = np.array([(lon.min() + lon.max()) / 2])
    for z in RING_ZOOMS:
        cov[z] = tiles_near(z, center_lat, center_lon, ring_radius_m)
    return with_ancestors(cov, min(RING_ZOOMS))


def dem_coverage(cov: Coverage) -> Coverage:
    return {z: t for z, t in cov.items() if z <= DEM_MAX_ZOOM}


def to_rows(tiles: set[Tile]) -> list[list[int]]:
    """Run-length rows [y, xStart, xEnd] (inclusive), sorted by y then x."""
    by_y: dict[int, list[int]] = defaultdict(list)
    for x, y in tiles:
        by_y[y].append(x)
    rows: list[list[int]] = []
    for y in sorted(by_y):
        xs = sorted(by_y[y])
        start = prev = xs[0]
        for x in xs[1:]:
            if x != prev + 1:
                rows.append([y, start, prev])
                start = x
            prev = x
        rows.append([y, start, prev])
    return rows


def from_rows(rows: list[list[int]] | list[tuple[int, int, int]]) -> set[Tile]:
    return {(x, y) for y, x0, x1 in rows for x in range(x0, x1 + 1)}


def coverage_rows(cov: Coverage) -> dict[str, list[list[int]]]:
    return {str(z): to_rows(cov[z]) for z in sorted(cov)}


def tiles_lonlat_bbox(z: int, tiles: set[Tile]) -> tuple[float, float, float, float]:
    """(west, south, east, north) of the block spanning `tiles`."""
    xs = [x for x, _ in tiles]
    ys = [y for _, y in tiles]
    b = block_bounds(z, min(xs), min(ys), max(xs), max(ys))
    west, south = merc_to_lonlat(b.minx, b.miny)
    east, north = merc_to_lonlat(b.maxx, b.maxy)
    return float(west), float(south), float(east), float(north)


def tile_centers_lonlat(z: int, tiles: set[Tile]) -> tuple[FloatArray, FloatArray]:
    s = tile_size_m(z)
    xs = np.array([x for x, _ in tiles], dtype=np.float64)
    ys = np.array([y for _, y in tiles], dtype=np.float64)
    return merc_to_lonlat(-MERC_HALF + (xs + 0.5) * s, MERC_HALF - (ys + 0.5) * s)


def chunk_tiles(tiles: set[Tile] | list[Tile], n: int) -> list[list[Tile]]:
    """Group tiles into n x n blocks aligned to the tile grid."""
    groups: dict[tuple[int, int], list[Tile]] = defaultdict(list)
    for x, y in tiles:
        groups[(x // n, y // n)].append((x, y))
    return [sorted(g) for _, g in sorted(groups.items())]
