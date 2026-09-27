"""NAIP aerial imagery from Microsoft Planetary Computer, mosaicked into web-map tiles."""

from __future__ import annotations

import hashlib
import io
import json
import logging
import math
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Protocol

import numpy as np
import numpy.typing as npt
import planetary_computer
import pystac_client
import rasterio
from PIL import Image
from rasterio.enums import ColorInterp, Resampling
from rasterio.transform import Affine
from rasterio.vrt import WarpedVRT
from rasterio.warp import calculate_default_transform
from rasterio.windows import from_bounds

from flyover.coverage import Coverage, Tile, chunk_tiles
from flyover.geo import TILE_PX, Bounds, FloatArray, block_bounds, merc_to_lonlat
from flyover.tilestore import LocalStore, img_key, write_atomic

log = logging.getLogger(__name__)

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
# Read cloud-optimized GeoTIFFs with a few large range requests instead of many small ones
COG_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "GDAL_HTTP_MULTIRANGE": "YES",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "GDAL_HTTP_MAX_RETRY": "3",
    "GDAL_HTTP_RETRY_DELAY": "1",
    "GDAL_HTTP_TIMEOUT": "60",
    "VSI_CACHE": "TRUE",
}

FULL_COVER = 0.999  # stop opening scenes once every pixel is this covered

Rgb = npt.NDArray[np.uint8]
LonLatBox = tuple[float, float, float, float]  # west, south, east, north


class ImageryError(Exception):
    """No usable NAIP imagery for the requested area."""


@dataclass(frozen=True)
class NaipItem:
    id: str
    year: int
    bbox: LonLatBox
    href: str  # unsigned asset URL; signed right before each read


def search_naip(
    bbox: LonLatBox,
    cache_dir: Path,
    open_client: Callable[[str], Any] = pystac_client.Client.open,
) -> list[NaipItem]:
    """Every NAIP scene intersecting `bbox`, all years. Cached as JSON per bbox."""
    digest = hashlib.sha1(json.dumps([round(v, 5) for v in bbox]).encode()).hexdigest()
    cached = cache_dir / "naip" / f"{digest}.json"
    if cached.is_file():
        try:
            return [
                NaipItem(**{**d, "bbox": tuple(d["bbox"])}) for d in json.loads(cached.read_text())
            ]
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            log.warning("%s: unreadable NAIP search cache (%s), refetching", cached.name, e)
            cached.unlink(missing_ok=True)
    client = open_client(STAC_URL)
    items = [
        NaipItem(
            id=it.id,
            year=int(it.properties["naip:year"]),
            bbox=tuple(float(v) for v in it.bbox),
            href=it.assets["image"].href,
        )
        for it in client.search(collections=["naip"], bbox=list(bbox), limit=1000).items()
    ]
    write_atomic(cached, json.dumps([asdict(i) for i in items]).encode())
    return items


def _inside(items: Iterable[NaipItem], lon: FloatArray, lat: FloatArray) -> npt.NDArray[np.bool_]:
    boxes = np.array([i.bbox for i in items], dtype=np.float64).reshape(-1, 4)
    lo, la = lon[:, None], lat[:, None]
    hit = (lo >= boxes[:, 0]) & (lo <= boxes[:, 2]) & (la >= boxes[:, 1]) & (la <= boxes[:, 3])
    return hit.any(axis=1)


def choose_year(items: list[NaipItem], lon: FloatArray, lat: FloatArray) -> int:
    """Newest NAIP year whose scenes cover every given point (the trail corridor)."""
    for year in sorted({i.year for i in items}, reverse=True):
        if _inside([i for i in items if i.year == year], lon, lat).all():
            return year
    raise ImageryError("No single NAIP year covers the whole trail corridor")


def order_items(items: list[NaipItem], year: int, bbox: LonLatBox) -> list[NaipItem]:
    """Scenes touching `bbox`: the chosen year first, then newest-first to fill gaps."""
    west, south, east, north = bbox
    touching = [
        i
        for i in items
        if i.bbox[0] <= east and i.bbox[2] >= west and i.bbox[1] <= north and i.bbox[3] >= south
    ]
    return sorted(touching, key=lambda i: (i.year != year, -i.year, i.id))


class ImageryReader(Protocol):
    def read(self, items: list[NaipItem], bounds: Bounds, width: int, height: int) -> Rgb:
        """RGB, shape (height, width, 3), EPSG:3857; earlier items win; zeros where none cover."""
        ...


class CogReader:
    """Reads NAIP scenes from cloud-optimized GeoTIFFs and composites them by coverage.

    Each scene is reprojected with an added alpha band that measures how much of each output
    pixel the scene covers. Reduced-size reads resample every band alike, so a scene-edge
    pixel comes back with color and alpha both scaled by its coverage (premultiplied). Scenes
    are layered front to back with the "over" operator, and the result is divided by total
    coverage. So a pixel on the seam between two scenes is an exact mix of both, a pixel on
    the outer edge of all imagery keeps its true color, and only uncovered pixels stay black.
    """

    def __init__(self, sign: Callable[[str], str] = planetary_computer.sign) -> None:
        self.sign = sign

    def read(self, items: list[NaipItem], bounds: Bounds, width: int, height: int) -> Rgb:
        color = np.zeros((height, width, 3), dtype=np.float32)  # premultiplied by coverage
        cover = np.zeros((height, width), dtype=np.float32)  # 0..1
        with rasterio.Env(**COG_ENV):
            for item in items:
                if (cover >= FULL_COVER).all():
                    break
                with rasterio.open(self.sign(item.href)) as src:
                    if ColorInterp.alpha in src.colorinterp:
                        # NAIP's 4th band is near-infrared; some years (Colorado 2017) label it
                        # alpha, which would make vegetation brightness decide coverage
                        log.debug("%s: infrared band labeled alpha; skipped", item.id)
                        continue
                    pad_m = max(bounds.maxx - bounds.minx, bounds.maxy - bounds.miny)
                    with _warped(src, pad_m=pad_m / min(width, height)) as vrt:
                        _composite(vrt, bounds, width, height, color, cover)
        out = np.zeros((height, width, 3), dtype=np.uint8)
        seen = cover >= 0.5  # mostly uncovered pixels stay black rather than show noise
        out[seen] = np.clip(np.round(color[seen] / cover[seen, None]), 0, 255).astype(np.uint8)
        return out


def _warped(src: rasterio.io.DatasetReader, pad_m: float) -> WarpedVRT:
    """`src` in EPSG:3857 at its native resolution, with an added alpha band and a transparent
    margin of `pad_m`. The margin lets output pixels that straddle the scene's edge be read
    whole, so the seam between neighboring scenes blends instead of dropping to black.
    """
    transform, w, h = calculate_default_transform(
        src.crs, "EPSG:3857", src.width, src.height, *src.bounds
    )
    pad = math.ceil(pad_m / transform.a) + 1  # margin in native pixels
    return WarpedVRT(
        src,
        crs="EPSG:3857",
        transform=transform @ Affine.translation(-pad, -pad),
        width=w + 2 * pad,
        height=h + 2 * pad,
        resampling=Resampling.bilinear,
        add_alpha=True,
    )


def _composite(
    vrt: WarpedVRT,
    bounds: Bounds,
    width: int,
    height: int,
    color: npt.NDArray[np.float32],
    cover: npt.NDArray[np.float32],
) -> None:
    """Layer this scene behind what's already in `color` and `cover` ("over" compositing)."""
    resx = (bounds.maxx - bounds.minx) / width
    resy = (bounds.maxy - bounds.miny) / height
    vb = vrt.bounds
    # output pixels lying fully inside the padded grid, which includes every pixel the scene touches
    c0 = max(0, math.ceil((vb.left - bounds.minx) / resx))
    c1 = min(width, math.floor((vb.right - bounds.minx) / resx))
    r0 = max(0, math.ceil((bounds.maxy - vb.top) / resy))
    r1 = min(height, math.floor((bounds.maxy - vb.bottom) / resy))
    if c1 <= c0 or r1 <= r0:
        return
    window = from_bounds(
        bounds.minx + c0 * resx,
        bounds.maxy - r1 * resy,
        bounds.minx + c1 * resx,
        bounds.maxy - r0 * resy,
        transform=vrt.transform,
    )
    # a reduced-size read, so GDAL serves it from the COG's overviews when zoomed out
    rgba = vrt.read(
        indexes=[1, 2, 3, vrt.colorinterp.index(ColorInterp.alpha) + 1],
        window=window,
        out_shape=(4, r1 - r0, c1 - c0),
        resampling=Resampling.bilinear,
    ).astype(np.float32)
    room = 1.0 - cover[r0:r1, c0:c1]  # how much of each pixel is still uncovered
    color[r0:r1, c0:c1] += room[..., None] * np.moveaxis(rgba[:3], 0, -1)
    cover[r0:r1, c0:c1] += room * (rgba[3] / 255.0)


def to_webp(rgb: Rgb, quality: int = 80) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(rgb, "RGB").save(buf, "WEBP", quality=quality, method=4)
    return buf.getvalue()


def build_img_tiles(
    cov: Coverage,
    items: list[NaipItem],
    year: int,
    reader: ImageryReader,
    store: LocalStore,
    chunk: int = 8,
    workers: int = 4,
) -> list[str]:
    """Write every missing imagery tile in `cov`. Returns the keys of all its tiles."""
    keys: list[str] = []
    jobs: list[tuple[int, list[Tile]]] = []
    for z in sorted(cov):
        keys.extend(img_key(year, z, x, y) for x, y in sorted(cov[z]))
        missing = [t for t in cov[z] if not store.exists(img_key(year, z, *t))]
        cached = len(cov[z]) - len(missing)
        log.info("img z%d: %d tiles to build, %d cached", z, len(missing), cached)
        jobs.extend((z, group) for group in chunk_tiles(missing, chunk))

    def run(job: tuple[int, list[Tile]]) -> None:
        z, group = job
        x0, x1 = min(x for x, _ in group), max(x for x, _ in group)
        y0, y1 = min(y for _, y in group), max(y for _, y in group)
        b = block_bounds(z, x0, y0, x1, y1)
        west, south = merc_to_lonlat(b.minx, b.miny)
        east, north = merc_to_lonlat(b.maxx, b.maxy)
        chosen = order_items(items, year, (float(west), float(south), float(east), float(north)))
        rgb = reader.read(chosen, b, (x1 - x0 + 1) * TILE_PX, (y1 - y0 + 1) * TILE_PX)
        for x, y in group:
            r0, c0 = (y - y0) * TILE_PX, (x - x0) * TILE_PX
            store.put(img_key(year, z, x, y), to_webp(rgb[r0 : r0 + TILE_PX, c0 : c0 + TILE_PX]))

    with ThreadPoolExecutor(workers) as pool:
        list(pool.map(run, jobs))
    return keys
