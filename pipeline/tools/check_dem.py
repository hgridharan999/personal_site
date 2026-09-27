"""Sanity-check a built hike's elevation tiles.

    uv run python tools/check_dem.py quandary

1. Samples the zoom-17 tile under the summit and compares it with the manifest's summit
   elevation (sampled separately from a 1 m grid). They should agree within 3 m.
2. Stitches the zoom-13 tiles into a hillshade PNG next to the manifest, to eyeball.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

from flyover.coverage import from_rows
from flyover.geo import TILE_PX, ground_resolution, lonlat_to_merc, merc_to_tile, tile_bounds
from flyover.manifest import Manifest
from flyover.terrain_rgb import from_webp
from flyover.tilestore import LocalStore, dem_key, hike_key

OUT = Path(__file__).resolve().parents[1] / "out"
TOLERANCE_M = 3.0


def summit_check(store: LocalStore, m: Manifest) -> float:
    mx, my = (float(v) for v in lonlat_to_merc(m.summit.lon, m.summit.lat))
    x, y = merc_to_tile(17, mx, my)
    h = from_webp(store.path(dem_key(17, x, y)).read_bytes())
    b = tile_bounds(17, x, y)
    px = (b.maxx - b.minx) / TILE_PX
    # texel (r, c) is centered at (minx + (c - 0.5) px, maxy - (r - 0.5) px); see the spec
    c = (mx - b.minx) / px + 0.5
    r = (b.maxy - my) / px + 0.5
    c0, r0 = int(c), int(r)
    fc, fr = c - c0, r - r0
    top = h[r0, c0] * (1 - fc) + h[r0, c0 + 1] * fc
    bottom = h[r0 + 1, c0] * (1 - fc) + h[r0 + 1, c0 + 1] * fc
    return float(top * (1 - fr) + bottom * fr)


def hillshade(store: LocalStore, m: Manifest, z: int = 13) -> Path:
    tiles = from_rows(m.tiles.coverage[str(z)])
    xs = [x for x, _ in tiles]
    ys = [y for _, y in tiles]
    x0, y0 = min(xs), min(ys)
    grid = np.zeros(((max(ys) - y0 + 1) * TILE_PX, (max(xs) - x0 + 1) * TILE_PX), np.float32)
    for x, y in tiles:
        r, c = (y - y0) * TILE_PX, (x - x0) * TILE_PX
        # drop the 1 px border; the neighbor supplies those pixels
        grid[r : r + TILE_PX, c : c + TILE_PX] = from_webp(
            store.path(dem_key(z, x, y)).read_bytes()
        )[1:-1, 1:-1]
    spacing = ground_resolution(z, m.summit.lat)
    dy, dx = np.gradient(grid, spacing)
    slope = np.arctan(np.hypot(dx, dy))
    aspect = np.arctan2(-dx, dy)
    sun_alt, sun_az = np.radians(45), np.radians(315)
    facing = np.cos(sun_az - aspect)
    shade = np.sin(sun_alt) * np.cos(slope) + np.cos(sun_alt) * np.sin(slope) * facing
    path = store.path(hike_key(m.slug, f"check-hillshade-z{z}.png"))
    Image.fromarray((np.clip(shade, 0, 1) * 255).astype(np.uint8), "L").save(path)
    return path


def main(slug: str) -> int:
    store = LocalStore(OUT)
    m = Manifest.model_validate_json(store.path(hike_key(slug, "manifest.json")).read_bytes())
    tile_ele = summit_check(store, m)
    diff = abs(tile_ele - m.summit.ele)
    print(f"summit: manifest {m.summit.ele:.1f} m, z17 tile {tile_ele:.1f} m, diff {diff:.2f} m")
    print(f"hillshade: {hillshade(store, m)}")
    return 0 if diff <= TOLERANCE_M else 1


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: uv run python tools/check_dem.py <slug>")
    sys.exit(main(sys.argv[1]))
