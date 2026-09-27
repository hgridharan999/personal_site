"""Place original photos on the track by capture time, and export web-sized copies."""

from __future__ import annotations

import hashlib
import io
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone, tzinfo
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from flyover.geo import FloatArray

log = logging.getLogger(__name__)

PHOTO_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
EXIF_IFD = 0x8769
DATETIME = 306
DATETIME_ORIGINAL = 36867
OFFSET_TIME_ORIGINAL = 36881
_OFFSET = re.compile(r"^([+-])(\d{2}):?(\d{2})$")


@dataclass(frozen=True)
class PlacedPhoto:
    source: Path
    t: float  # seconds since the track's start
    idx: int  # nearest resampled track point
    caption: str | None


@dataclass(frozen=True)
class ExportedPhoto:
    src: str  # path relative to the hike's folder, e.g. "photos/3f9a1c2b4d5e.webp"
    t: float
    idx: int
    w: int
    h: int
    caption: str | None


def _parse_offset(raw: object) -> tzinfo | None:
    m = _OFFSET.match(str(raw).strip())
    if not m:
        return None
    sign = -1 if m.group(1) == "-" else 1
    return timezone(sign * timedelta(hours=int(m.group(2)), minutes=int(m.group(3))))


def capture_time(path: Path, fallback_tz: tzinfo, offset_s: float = 0.0) -> datetime | None:
    """UTC capture time from EXIF, or None if the photo has no usable timestamp."""
    with Image.open(path) as im:
        exif = im.getexif()
    sub = exif.get_ifd(EXIF_IFD)
    raw = sub.get(DATETIME_ORIGINAL) or exif.get(DATETIME)
    if not raw:
        return None
    try:
        local = datetime.strptime(str(raw).strip(), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None
    tz = _parse_offset(sub.get(OFFSET_TIME_ORIGINAL, "")) or fallback_tz
    return (local.replace(tzinfo=tz) + timedelta(seconds=offset_s)).astimezone(UTC)


def place_photos(
    paths: list[Path],
    start: datetime,
    t: FloatArray,
    captions: dict[str, str],
    fallback_tz: tzinfo,
    offset_s: float = 0.0,
) -> list[PlacedPhoto]:
    placed: list[PlacedPhoto] = []
    for path in sorted(paths):
        if path.suffix.lower() not in PHOTO_SUFFIXES:
            log.warning("%s: unsupported format (convert HEIC to JPEG first), skipped", path.name)
            continue
        taken = capture_time(path, fallback_tz, offset_s)
        if taken is None:
            log.warning("%s: no EXIF capture time, skipped", path.name)
            continue
        rel = (taken - start).total_seconds()
        if rel < 0 or rel > t[-1]:
            log.warning("%s: taken outside the recorded track, skipped", path.name)
            continue
        idx = int(np.argmin(np.abs(t - rel)))
        placed.append(PlacedPhoto(path, rel, idx, captions.get(path.name)))
    return sorted(placed, key=lambda p: p.t)


def export_photo(path: Path, max_px: int = 1600, quality: int = 82) -> tuple[str, bytes, int, int]:
    """Upright, at most `max_px` on the long edge, EXIF stripped, content-hashed WebP."""
    with Image.open(path) as im:
        upright = ImageOps.exif_transpose(im).convert("RGB")
    upright.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    upright.save(buf, "WEBP", quality=quality, method=6)
    data = buf.getvalue()
    return f"{hashlib.sha256(data).hexdigest()[:12]}.webp", data, upright.width, upright.height
