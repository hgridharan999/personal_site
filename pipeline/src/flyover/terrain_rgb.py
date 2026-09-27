"""Heights <-> terrain-RGB pixels: h = -10000 + (R*65536 + G*256 + B) * 0.1 meters."""

from __future__ import annotations

import io

import numpy as np
import numpy.typing as npt
from PIL import Image

BASE_M = -10000.0
STEP_M = 0.1
_MAX = 2**24 - 1


def encode(heights: npt.ArrayLike) -> npt.NDArray[np.uint8]:
    h = np.nan_to_num(np.asarray(heights, dtype=np.float64), nan=0.0)
    v = np.clip(np.round((h - BASE_M) / STEP_M), 0, _MAX).astype(np.uint32)
    return np.stack([(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF], axis=-1).astype(np.uint8)


def decode(rgb: npt.NDArray[np.uint8]) -> npt.NDArray[np.float32]:
    c = rgb.astype(np.uint32)
    v = c[..., 0] * 65536 + c[..., 1] * 256 + c[..., 2]
    return (BASE_M + v * STEP_M).astype(np.float32)


def to_webp(heights: npt.ArrayLike) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(encode(heights), "RGB").save(buf, "WEBP", lossless=True, method=6)
    return buf.getvalue()


def from_webp(data: bytes) -> npt.NDArray[np.float32]:
    with Image.open(io.BytesIO(data)) as im:
        return decode(np.asarray(im.convert("RGB")))
