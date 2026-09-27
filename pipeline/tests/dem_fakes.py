"""Stand-ins for USGS 3DEP."""

from __future__ import annotations

import numpy as np
from helpers import TRAILHEAD
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds

from flyover.geo import Bounds, lonlat_to_merc

_REF_X, _REF_Y = (float(v) for v in lonlat_to_merc(TRAILHEAD[1], TRAILHEAD[0]))


class PlaneDem:
    """h = base + bx * dx + by * dy (merc meters from TRAILHEAD), sampled at pixel centers."""

    def __init__(self, base: float = 3500.0, bx: float = 0.01, by: float = 0.05) -> None:
        self.base, self.bx, self.by = base, bx, by
        self.calls: list[tuple[Bounds, int, int]] = []

    def height_at(self, mx: float, my: float) -> float:
        return self.base + self.bx * (mx - _REF_X) + self.by * (my - _REF_Y)

    def fetch(self, bounds: Bounds, width: int, height: int) -> np.ndarray:
        self.calls.append((bounds, width, height))
        px = (bounds.maxx - bounds.minx) / width
        py = (bounds.maxy - bounds.miny) / height
        cx = bounds.minx + (np.arange(width) + 0.5) * px
        cy = bounds.maxy - (np.arange(height) + 0.5) * py
        return (
            self.base + self.bx * (cx[None, :] - _REF_X) + self.by * (cy[:, None] - _REF_Y)
        ).astype(np.float32)


def geotiff_bytes(bounds: Bounds, heights: np.ndarray) -> bytes:
    h, w = heights.shape
    with MemoryFile() as mf:
        with mf.open(
            driver="GTiff",
            width=w,
            height=h,
            count=1,
            dtype="float32",
            crs="EPSG:3857",
            transform=from_bounds(*bounds, w, h),
        ) as ds:
            ds.write(heights.astype(np.float32), 1)
        return mf.read()
