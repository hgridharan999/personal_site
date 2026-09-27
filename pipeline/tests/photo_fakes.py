"""Photos with EXIF capture times."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


def write_jpeg(
    path: Path, taken: str | None, offset: str | None = None, size: tuple[int, int] = (64, 48)
) -> Path:
    """A small JPEG with DateTimeOriginal (and optionally OffsetTimeOriginal) set."""
    img = Image.new("RGB", size, (120, 140, 160))
    exif = Image.Exif()
    sub = exif.get_ifd(0x8769)
    if taken:
        sub[36867] = taken
    if offset:
        sub[36881] = offset
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", exif=exif.tobytes())
    return path
