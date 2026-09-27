import io
from types import SimpleNamespace

import numpy as np
import pytest
from imagery_fakes import SolidReader, naip, write_utm_rgb
from PIL import Image
from rasterio.warp import transform, transform_bounds

from flyover.geo import TILE_PX, Bounds
from flyover.imagery import (
    CogReader,
    ImageryError,
    NaipItem,
    build_img_tiles,
    choose_year,
    order_items,
    search_naip,
)
from flyover.tilestore import LocalStore, img_key

A = naip("a2023", 2023, (-106.2, 39.3, -106.1, 39.4))
B = naip("b2023", 2023, (-106.1, 39.3, -106.0, 39.4))
C = naip("c2021", 2021, (-106.2, 39.3, -106.0, 39.4))


def test_choose_year_prefers_the_newest_full_cover():
    lon = np.array([-106.15, -106.05])
    lat = np.array([39.35, 39.35])
    assert choose_year([A, B, C], lon, lat) == 2023
    assert choose_year([A, C], lon, lat) == 2021  # 2023 misses the east point
    with pytest.raises(ImageryError):
        choose_year([A], lon, lat)


def test_order_items_puts_the_chosen_year_first_and_drops_far_scenes():
    far = naip("far", 2023, (-105.0, 39.0, -104.9, 39.1))
    assert [i.id for i in order_items([C, far, B, A], 2023, (-106.15, 39.32, -106.05, 39.38))] == [
        "a2023",
        "b2023",
        "c2021",
    ]


def test_search_naip_maps_items_and_caches(tmp_path):
    opened = []

    def fake_open(url):
        opened.append(url)
        item = SimpleNamespace(
            id="co_x",
            properties={"naip:year": "2023"},
            bbox=[-106.2, 39.3, -106.1, 39.4],
            assets={"image": SimpleNamespace(href="https://example.blob/co_x.tif")},
        )
        return SimpleNamespace(search=lambda **kw: SimpleNamespace(items=lambda: iter([item])))

    bbox = (-106.3, 39.2, -106.0, 39.5)
    first = search_naip(bbox, tmp_path, open_client=fake_open)
    second = search_naip(bbox, tmp_path, open_client=fake_open)
    expected = NaipItem("co_x", 2023, (-106.2, 39.3, -106.1, 39.4), "https://example.blob/co_x.tif")
    assert first == second == [expected]
    assert len(opened) == 1


# Two NAIP-like scenes, red west of blue, overlapping 500 m, read in a row from 200 m west
# of red to 200 m east of blue.
ROW = Bounds(*transform_bounds("EPSG:26913", "EPSG:3857", 399_800, 4_360_300, 401_700, 4_360_700))


def two_scenes(tmp_path, red_alpha=False):
    red = write_utm_rgb(tmp_path / "red.tif", (255, 0, 0), 400_000, 4_360_000, 1000, red_alpha)
    blue = write_utm_rgb(tmp_path / "blue.tif", (0, 0, 255), 400_500, 4_360_000, 1000)
    return NaipItem("red", 2021, (0, 0, 0, 0), str(red)), NaipItem(
        "blue", 2023, (0, 0, 0, 0), str(blue)
    )


def read_row(items, width, height):
    """Read ROW at width x height and return a UTM-easting -> [r, g, b] lookup for its middle."""
    rgb = CogReader(sign=lambda href: href).read(items, ROW, width, height)  # local: no signing

    def pixel(utm_x):
        (mx,), (my,) = transform("EPSG:26913", "EPSG:3857", [utm_x], [4_360_500])
        r = int((ROW.maxy - my) / (ROW.maxy - ROW.miny) * height)
        c = int((mx - ROW.minx) / (ROW.maxx - ROW.minx) * width)
        return rgb[r, c].tolist()

    return rgb, pixel


def test_cog_reader_mosaics_with_priority_and_leaves_gaps_black(tmp_path):
    red, blue = two_scenes(tmp_path)
    _, pixel = read_row([blue, red], 400, 100)
    assert pixel(399_900) == [0, 0, 0]  # no scene
    assert pixel(400_250) == [255, 0, 0]  # red only
    assert pixel(400_750) == [0, 0, 255]  # overlap: blue listed first wins
    assert pixel(401_250) == [0, 0, 255]  # blue only
    assert pixel(401_600) == [0, 0, 0]


def test_cog_reader_blends_scene_edges_without_darkening(tmp_path):
    # Zoomed out, pixels (~26 m here) are wider than the overlap between neighboring scenes
    # (10 m here), so the pixel on the seam is only partly inside each. It must become a mix of
    # the two scenes: never black, and never mixed with the black outside them.
    red = write_utm_rgb(tmp_path / "red.tif", (255, 0, 0), 400_000, 4_360_000, 1000)
    blue = write_utm_rgb(tmp_path / "blue.tif", (0, 0, 255), 400_990, 4_360_000, 1000)
    items = [
        NaipItem("blue", 2023, (0, 0, 0, 0), str(blue)),
        NaipItem("red", 2021, (0, 0, 0, 0), str(red)),
    ]
    inside = Bounds(
        *transform_bounds("EPSG:26913", "EPSG:3857", 400_100, 4_360_300, 401_890, 4_360_700)
    )
    rgb = CogReader(sign=lambda href: href).read(items, inside, 69, 15)
    for r, g, b in rgb[7].tolist():
        assert g == 0 and 250 <= r + b <= 256, (r, g, b)


def test_cog_reader_skips_scenes_whose_infrared_band_is_labeled_alpha(tmp_path):
    # NAIP's 4th band is near-infrared; Colorado 2017 labels it alpha. Using it as
    # transparency would make vegetation brightness decide coverage, so skip the scene.
    red, blue = two_scenes(tmp_path, red_alpha=True)
    _, pixel = read_row([red, blue], 400, 100)
    assert pixel(400_250) == [0, 0, 0]  # red skipped, nothing else here
    assert pixel(400_750) == [0, 0, 255]  # blue fills the overlap
    assert pixel(401_250) == [0, 0, 255]


def test_build_img_tiles_writes_256px_webp_and_skips_existing(tmp_path):
    reader, store = SolidReader(), LocalStore(tmp_path)
    x, y = 26903, 49906
    store.put(img_key(2023, 17, x + 1, y), b"old")
    keys = build_img_tiles({17: {(x, y), (x + 1, y)}}, [A, C], 2023, reader, store)
    assert keys == [img_key(2023, 17, x, y), img_key(2023, 17, x + 1, y)]
    with Image.open(io.BytesIO(store.path(keys[0]).read_bytes())) as im:
        assert im.size == (TILE_PX, TILE_PX) and im.format == "WEBP"
    assert store.path(keys[1]).read_bytes() == b"old"
    assert len(reader.calls) == 1 and reader.calls[0][0] == "a2023"
