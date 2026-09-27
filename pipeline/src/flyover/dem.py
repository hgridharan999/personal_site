"""USGS 3DEP elevation: fetch, sample under the track, and cut into terrain-RGB tiles."""

from __future__ import annotations

import hashlib
import json
import logging
import math
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Protocol

import httpx
import numpy as np
import numpy.typing as npt
import rasterio.errors
from rasterio.io import MemoryFile
from scipy.ndimage import map_coordinates

from flyover.coverage import Coverage, Tile, chunk_tiles
from flyover.geo import TILE_PX, Bounds, FloatArray, block_bounds, lonlat_to_merc, tile_size_m
from flyover.terrain_rgb import to_webp
from flyover.tilestore import LocalStore, dem_key, write_atomic

log = logging.getLogger(__name__)

EXPORT_URL = (
    "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
)
MAX_REQUEST_PX = 4100  # the service allows 8000 per side; this fits a 16x16-tile chunk + border
MIN_SPLIT_PX = 256  # stop halving a rejected request below this size
DEM_TILE_PX = TILE_PX + 2  # 1 px border on every side, copied from the neighbors

Heights = npt.NDArray[np.float32]


class DemError(Exception):
    """3DEP returned something other than the requested heights."""


class DemSource(Protocol):
    def fetch(self, bounds: Bounds, width: int, height: int) -> Heights:
        """Heights in meters, shape (height, width), row 0 along bounds.maxy.

        Pixel (r, c) is sampled at its center: (minx + (c + 0.5) * px, maxy - (r + 0.5) * px).
        """
        ...


class UsgsDemSource:
    def __init__(
        self,
        cache_dir: Path,
        client: httpx.Client | None = None,
        retries: int = 3,
        backoff_s: float = 1.0,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.cache_dir = cache_dir / "dem"
        self.client = client or httpx.Client(timeout=120)
        self.retries = retries
        self.backoff_s = backoff_s
        self.sleep = sleep

    def fetch(self, bounds: Bounds, width: int, height: int) -> Heights:
        params = {
            "bbox": ",".join(f"{v:.6f}" for v in bounds),
            "bboxSR": "3857",
            "imageSR": "3857",
            "size": f"{width},{height}",
            "format": "tiff",
            "pixelType": "F32",
            "interpolation": "RSP_BilinearInterpolation",
            "f": "image",
        }
        digest = hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()
        cached = self.cache_dir / f"{digest}.tif"
        if cached.is_file():
            try:
                return _decode(cached.read_bytes(), width, height)
            except DemError as e:
                log.warning("%s: unreadable cached tile (%s), refetching", cached.name, e)
                cached.unlink(missing_ok=True)
        data = self._get(params)
        heights = _decode(data, width, height)  # validate first: a bad response must not stick
        write_atomic(cached, data)
        return heights

    def _get(self, params: dict[str, str]) -> bytes:
        last: Exception | None = None
        for attempt in range(self.retries):
            try:
                r = self.client.get(EXPORT_URL, params=params)
                if r.status_code == 200 and r.headers.get("content-type", "").startswith(
                    "image/tiff"
                ):
                    return r.content
                last = DemError(f"3DEP answered {r.status_code}: {r.text[:200]}")
            except httpx.HTTPError as e:
                last = e
            if attempt < self.retries - 1:
                self.sleep(self.backoff_s * 2**attempt)
        raise DemError(f"3DEP request failed after {self.retries} attempts") from last


def _decode(data: bytes, width: int, height: int) -> Heights:
    try:
        with MemoryFile(data) as mf, mf.open() as ds:
            a = ds.read(1).astype(np.float32)
    except rasterio.errors.RasterioError as e:
        raise DemError(f"unreadable 3DEP TIFF: {e}") from e
    if a.shape != (height, width):
        raise DemError(f"3DEP returned {a.shape[1]}x{a.shape[0]}, asked for {width}x{height}")
    # 3DEP answers 0 over the ocean; anything below -1000 m is a fill value
    return np.where(np.isfinite(a) & (a > -1000), a, 0.0).astype(np.float32)


def fetch_mosaic(
    source: DemSource, bounds: Bounds, width: int, height: int, max_px: int = MAX_REQUEST_PX
) -> Heights:
    """Like source.fetch, but in requests of at most max_px per side, halving any 3DEP rejects."""
    resx = (bounds.maxx - bounds.minx) / width
    resy = (bounds.maxy - bounds.miny) / height
    out = np.empty((height, width), dtype=np.float32)
    for r0 in range(0, height, max_px):
        for c0 in range(0, width, max_px):
            h = min(max_px, height - r0)
            w = min(max_px, width - c0)
            sub = Bounds(
                bounds.minx + c0 * resx,
                bounds.maxy - (r0 + h) * resy,
                bounds.minx + (c0 + w) * resx,
                bounds.maxy - r0 * resy,
            )
            out[r0 : r0 + h, c0 : c0 + w] = _fetch_or_split(source, sub, w, h)
    return out


def _fetch_or_split(source: DemSource, bounds: Bounds, width: int, height: int) -> Heights:
    """Fetch, and if 3DEP rejects the request, fetch its two halves instead.

    3DEP answers 500 when one request has to mosaic too many source rasters, which happens
    for wide areas at ~30 m resolution. Halves are split on pixel boundaries, so every
    pixel keeps its center and the stitched result is identical.
    """
    try:
        return source.fetch(bounds, width, height)
    except DemError:
        if max(width, height) <= MIN_SPLIT_PX:
            raise
        log.warning("3DEP rejected a %dx%d request; fetching it in halves", width, height)
    if width >= height:
        half = width // 2
        cut = bounds.minx + half * (bounds.maxx - bounds.minx) / width
        left = _fetch_or_split(
            source, Bounds(bounds.minx, bounds.miny, cut, bounds.maxy), half, height
        )
        right = _fetch_or_split(
            source, Bounds(cut, bounds.miny, bounds.maxx, bounds.maxy), width - half, height
        )
        return np.hstack([left, right])
    half = height // 2
    cut = bounds.maxy - half * (bounds.maxy - bounds.miny) / height
    top = _fetch_or_split(source, Bounds(bounds.minx, cut, bounds.maxx, bounds.maxy), width, half)
    bottom = _fetch_or_split(
        source, Bounds(bounds.minx, bounds.miny, bounds.maxx, cut), width, height - half
    )
    return np.vstack([top, bottom])


def sample_elevations(
    source: DemSource,
    lat: FloatArray,
    lon: FloatArray,
    ground_res_m: float = 1.0,
    margin_m: float = 50.0,
    max_px: int = MAX_REQUEST_PX,
) -> FloatArray:
    """Bilinear DEM heights under each point, from a ~1 m grid around the track."""
    mx, my = lonlat_to_merc(lon, lat)
    stretch = 1 / math.cos(math.radians(float(np.mean(lat))))  # merc meters per ground meter
    res = ground_res_m * stretch
    minx = float(mx.min()) - margin_m * stretch
    maxy = float(my.max()) + margin_m * stretch
    width = math.ceil((float(mx.max()) + margin_m * stretch - minx) / res)
    height = math.ceil((maxy - (float(my.min()) - margin_m * stretch)) / res)
    grid = fetch_mosaic(
        source, Bounds(minx, maxy - height * res, minx + width * res, maxy), width, height, max_px
    )
    cols = (mx - minx) / res - 0.5
    rows = (maxy - my) / res - 0.5
    return map_coordinates(grid, [rows, cols], order=1, mode="nearest").astype(np.float64)


def build_dem_tiles(
    cov: Coverage,
    source: DemSource,
    store: LocalStore,
    chunk: int = 16,
    workers: int = 4,
) -> list[str]:
    """Write every missing DEM tile in `cov`. Returns the keys of all its tiles."""
    keys: list[str] = []
    jobs: list[tuple[int, list[Tile]]] = []
    for z in sorted(cov):
        keys.extend(dem_key(z, x, y) for x, y in sorted(cov[z]))
        missing = [t for t in cov[z] if not store.exists(dem_key(z, *t))]
        jobs.extend((z, group) for group in chunk_tiles(missing, chunk))
    with ThreadPoolExecutor(workers) as pool:
        list(pool.map(lambda job: _build_chunk(job[0], job[1], source, store), jobs))
    return keys


def _build_chunk(z: int, group: list[Tile], source: DemSource, store: LocalStore) -> None:
    x0, x1 = min(x for x, _ in group), max(x for x, _ in group)
    y0, y1 = min(y for _, y in group), max(y for _, y in group)
    px = tile_size_m(z) / TILE_PX
    bounds = block_bounds(z, x0, y0, x1, y1).expand(px)
    heights = fetch_mosaic(source, bounds, (x1 - x0 + 1) * TILE_PX + 2, (y1 - y0 + 1) * TILE_PX + 2)
    for x, y in group:
        r0 = (y - y0) * TILE_PX
        c0 = (x - x0) * TILE_PX
        store.put(dem_key(z, x, y), to_webp(heights[r0 : r0 + DEM_TILE_PX, c0 : c0 + DEM_TILE_PX]))
