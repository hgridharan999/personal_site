import numpy as np
import pytest

from flyover.terrain_rgb import decode, encode, from_webp, to_webp
from flyover.tilestore import LocalStore, dem_key, hike_key, img_key, summarize


def test_terrain_rgb_round_trip_within_5_cm():
    h = np.random.default_rng(1).uniform(-50, 8849, size=(258, 258))
    # 0.05 m from the 0.1 m step, plus float32 rounding in decode
    assert np.abs(decode(encode(h)) - h).max() <= 0.05 + 1e-3


def test_terrain_rgb_known_value():
    # (4348.0 + 10000) / 0.1 = 143480 = 0x023078
    assert encode(np.array([[4348.0]]))[0, 0].tolist() == [0x02, 0x30, 0x78]


def test_nan_heights_encode_as_sea_level():
    assert decode(encode(np.array([[np.nan]])))[0, 0] == pytest.approx(0.0, abs=0.05)


def test_webp_is_lossless():
    h = np.random.default_rng(2).uniform(2000, 4400, size=(258, 258)).astype(np.float32)
    assert np.abs(from_webp(to_webp(h)) - h).max() <= 0.05 + 1e-3


def test_keys():
    assert dem_key(17, 26903, 49906) == "tiles/v1/dem/17/26903/49906.webp"
    assert img_key(2023, 18, 1, 2) == "tiles/v1/img/2023/18/1/2.webp"
    assert hike_key("quandary", "manifest.json") == "hikes/quandary/manifest.json"


def test_store_put_exists_and_summarize(tmp_path):
    store = LocalStore(tmp_path)
    keys = [
        dem_key(17, 1, 1),
        dem_key(17, 1, 2),
        img_key(2023, 18, 1, 1),
        hike_key("q", "manifest.json"),
    ]
    for i, key in enumerate(keys):
        store.put(key, b"x" * (i + 1))
    assert store.exists(keys[0]) and not store.exists(dem_key(16, 0, 0))
    assert not list(tmp_path.rglob("*.tmp"))
    assert summarize(store, keys) == [
        ("dem", "17", 2, 3),
        ("hike", "-", 1, 4),
        ("img", "18", 1, 3),
    ]
