import pytest

from flyover.config import ConfigError, load_config


def write(tmp_path, slug, body):
    (tmp_path / f"{slug}.toml").write_text(body, encoding="utf-8")
    return tmp_path


def test_minimal_config_gets_defaults(tmp_path):
    cfg = load_config(
        write(tmp_path, "quandary", 'name = "Quandary Peak"\ndata_js_name = "Quandary Peak"\n'),
        "quandary",
    )
    assert cfg.slug == "quandary"
    assert cfg.timezone is None and cfg.naip_year is None
    assert cfg.trim_start_m == 0 and cfg.photo_time_offset_s == 0
    assert cfg.playback.duration_s == 150 and cfg.playback.summit_s == 10


def test_full_config(tmp_path):
    body = """
name = "Mt. Bierstadt"
data_js_name = "Mt. Bierstadt"
timezone = "America/Denver"
trim_start_m = 150
naip_year = 2021
photo_time_offset_s = -3600

[captions]
"IMG_7182.jpeg" = "Headlamps at the trailhead"

[playback]
duration_s = 120
"""
    cfg = load_config(write(tmp_path, "bierstadt", body), "bierstadt")
    assert cfg.timezone == "America/Denver" and cfg.naip_year == 2021
    assert cfg.captions == {"IMG_7182.jpeg": "Headlamps at the trailhead"}
    assert cfg.playback.duration_s == 120 and cfg.playback.photo_s == 2.5


def test_missing_file(tmp_path):
    with pytest.raises(ConfigError, match="expected"):
        load_config(tmp_path, "nope")


def test_slug_mismatch(tmp_path):
    write(tmp_path, "a", 'slug = "b"\nname = "A"\ndata_js_name = "A"\n')
    with pytest.raises(ConfigError, match="declares slug 'b'"):
        load_config(tmp_path, "a")


def test_unknown_timezone(tmp_path):
    write(tmp_path, "a", 'name = "A"\ndata_js_name = "A"\ntimezone = "Mars/Olympus"\n')
    with pytest.raises(ConfigError, match="unknown time zone"):
        load_config(tmp_path, "a")


def test_unknown_key_is_rejected(tmp_path):
    write(tmp_path, "a", 'name = "A"\ndata_js_name = "A"\ntrim_start = 5\n')
    with pytest.raises(ConfigError, match="trim_start"):
        load_config(tmp_path, "a")
