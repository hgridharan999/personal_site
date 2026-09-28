"""Stand-ins for NAIP scenes and the Planetary Computer."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_bounds

from flyover.geo import Bounds
from flyover.imagery import NaipItem


def naip(id_: str, year: int, bbox: tuple[float, float, float, float]) -> NaipItem:
    return NaipItem(id=id_, year=year, bbox=bbox, href=f"file:///{id_}.tif")


class SolidReader:
    """Fills each read with a color from the first item's year; black when no item covers."""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def read(self, items: list[NaipItem], bounds: Bounds, width: int, height: int) -> np.ndarray:
        self.calls.append([i.id for i in items])
        color = (items[0].year % 256, 100, 50) if items else (0, 0, 0)
        return np.full((height, width, 3), color, dtype=np.uint8)


def write_utm_rgb(
    path: Path,
    color: tuple[int, int, int],
    west: float,
    south: float,
    size_m: float,
    alpha: bool = False,
    nodata: float | None = None,
) -> Path:
    """A NAIP-like UTM 13N GeoTIFF of one solid color, 1 m pixels.

    Like most NAIP: bands red, green, blue, near-infrared (undefined), no alpha. With
    `alpha=True`, like some NAIP scenes: the 4th band is an opaque alpha band instead. With
    `nodata` set, like some NAIP COGs: a NoData tag is present even though the scene is fully
    opaque and coverage is tracked by the alpha band GDAL adds.
    """
    n = int(size_m)
    arr = np.zeros((4, n, n), dtype=np.uint8)
    for band, value in enumerate(color):
        arr[band] = value
    arr[3] = 255 if alpha else 128
    # without photometric="RGB", GDAL labels a 4th band as alpha
    extra = {} if alpha else {"photometric": "RGB"}
    if nodata is not None:
        extra["nodata"] = nodata
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=n,
        height=n,
        count=4,
        dtype="uint8",
        crs="EPSG:26913",
        transform=from_bounds(west, south, west + size_m, south + size_m, n, n),
        **extra,
    ) as ds:
        ds.write(arr)
    return path
