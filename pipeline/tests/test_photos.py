import io
import logging
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import numpy as np
import pytest
from helpers import START
from photo_fakes import write_jpeg
from PIL import Image

from flyover.photos import capture_time, export_photo, place_photos

DENVER = ZoneInfo("America/Denver")
T = np.arange(0, 3601, 5, dtype=float)  # a one-hour track sampled every 5 s


def test_capture_time_uses_the_exif_offset(tmp_path):
    p = write_jpeg(tmp_path / "a.jpg", "2026:07:12 05:30:00", "-06:00")
    assert capture_time(p, DENVER) == datetime(2026, 7, 12, 11, 30, tzinfo=UTC)


def test_capture_time_falls_back_to_the_hike_time_zone(tmp_path):
    p = write_jpeg(tmp_path / "a.jpg", "2026:07:12 05:30:00")
    assert capture_time(p, DENVER) == datetime(2026, 7, 12, 11, 30, tzinfo=UTC)  # MDT = UTC-6


def test_capture_time_applies_the_clock_offset(tmp_path):
    p = write_jpeg(tmp_path / "a.jpg", "2026:07:12 05:30:00", "-06:00")
    assert capture_time(p, DENVER, offset_s=-90) == datetime(2026, 7, 12, 11, 28, 30, tzinfo=UTC)


def test_capture_time_is_none_without_exif(tmp_path):
    assert capture_time(write_jpeg(tmp_path / "a.jpg", None), DENVER) is None


def test_place_photos_on_the_track(tmp_path, caplog):
    inside = write_jpeg(tmp_path / "IMG_2.jpg", "2026:07:12 05:20:00", "-06:00")  # START + 1200 s
    early = write_jpeg(tmp_path / "IMG_1.jpg", "2026:07:12 04:00:00", "-06:00")
    no_time = write_jpeg(tmp_path / "IMG_3.jpg", None)
    heic = tmp_path / "IMG_4.HEIC"
    heic.write_bytes(b"not really")
    junk = tmp_path / "junk.jpg"
    junk.write_bytes(b"not a jpeg")
    with caplog.at_level(logging.WARNING):
        placed = place_photos(
            [early, heic, inside, no_time, junk], START, T, {"IMG_2.jpg": "Treeline"}, DENVER
        )
    assert [(p.source.name, p.t, p.idx, p.caption) for p in placed] == [
        ("IMG_2.jpg", 1200.0, 240, "Treeline")
    ]
    text = caplog.text
    assert "IMG_1.jpg" in text and "IMG_3.jpg" in text and "IMG_4.HEIC" in text
    assert "junk.jpg" in text


def test_export_photo_resizes_strips_exif_and_hashes(tmp_path):
    src = write_jpeg(tmp_path / "big.jpg", "2026:07:12 05:20:00", "-06:00", size=(4000, 3000))
    name, data, w, h = export_photo(src)
    assert (w, h) == (1600, 1200)
    assert name.endswith(".webp") and len(name) == len("0123456789ab.webp")
    with Image.open(io.BytesIO(data)) as im:
        assert im.format == "WEBP" and im.size == (1600, 1200)
        assert not im.getexif()  # capture time and any GPS stay private
    assert export_photo(src)[0] == name  # same input, same name


@pytest.mark.parametrize("orientation,expected", [(1, (40, 20)), (6, (20, 40))])
def test_export_photo_applies_exif_orientation(tmp_path, orientation, expected):
    img = Image.new("RGB", (40, 20))
    exif = Image.Exif()
    exif[0x0112] = orientation
    path = tmp_path / "o.jpg"
    img.save(path, "JPEG", exif=exif.tobytes())
    assert export_photo(path)[2:] == expected
