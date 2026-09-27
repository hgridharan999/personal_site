import logging

from dem_fakes import PlaneDem
from helpers import synth_track, write_gpx
from imagery_fakes import SolidReader, naip
from photo_fakes import write_jpeg
from typer.testing import CliRunner

from flyover.cli import Paths, Radii, Sources, app, build_hike, report
from flyover.manifest import Manifest
from flyover.tilestore import LocalStore
from flyover.upload import manifest_keys

SMALL = Radii(corridor_m={18: 60, 17: 120, 16: 240, 15: 480, 14: 960, 13: 1920}, ring_m=4000)
COLORADO = (-107.0, 38.0, -105.0, 41.0)


def make_paths(tmp_path):
    paths = Paths(
        hikes=tmp_path / "hikes",
        inputs=tmp_path / "input",
        out=tmp_path / "out",
        cache=tmp_path / ".cache",
        env_file=tmp_path / ".env",
    )
    paths.hikes.mkdir()
    (paths.hikes / "demo.toml").write_text(
        'name = "Demo Peak"\ndata_js_name = "Demo Peak"\n\n[captions]\n"IMG_1.jpg" = "Top"\n',
        encoding="utf-8",
    )
    # 20 min up (north, uphill on PlaneDem), 5 min on top, 20 min down
    pts = synth_track([("walk", 1200, 1.0, 0), ("stop", 300, 1.0, 0), ("walk", 1200, 1.0, 180)])
    write_gpx(paths.inputs / "demo" / "track.gpx", pts)
    write_jpeg(paths.inputs / "demo" / "photos" / "IMG_1.jpg", "2026:07:12 05:22:00", "-06:00")
    return paths


def fake_sources():
    return Sources(
        dem=PlaneDem(),
        imagery=SolidReader(),
        search=lambda bbox, cache: [naip("co", 2023, COLORADO)],
    )


def test_build_hike_end_to_end_offline(tmp_path):
    paths = make_paths(tmp_path)
    result = build_hike("demo", paths, fake_sources(), SMALL)
    store = LocalStore(paths.out)
    m = Manifest.model_validate_json(store.path("hikes/demo/manifest.json").read_bytes())
    assert m == result.manifest
    assert m.timezone == "America/Denver" and m.tiles.naip_year == 2023
    assert len(m.stops) == 1 and m.stops[0].seconds > 240
    assert abs(m.summit.idx - len(m.track.t) / 2) < 30  # the turnaround is the top
    assert m.stats.gain_m > 50 and m.stats.distance_m > 2000
    assert [(p.caption, p.idx > 0) for p in m.photos] == [("Top", True)]
    tiles, photos, manifest_key = manifest_keys(m)
    assert all(store.exists(k) for k in (*tiles, *photos, manifest_key))
    assert set(result.keys) == {*tiles, *photos, manifest_key}
    assert "total" in report(store, result.keys)


def test_rebuild_reuses_existing_tiles(tmp_path):
    paths = make_paths(tmp_path)
    build_hike("demo", paths, fake_sources(), SMALL)
    again = fake_sources()
    build_hike("demo", paths, again, SMALL)
    assert len(again.dem.calls) == 1  # only the track-elevation sample; every tile was cached
    assert again.imagery.calls == []


def test_cli_reports_a_missing_config_cleanly(monkeypatch, tmp_path):
    monkeypatch.setattr(Paths, "default", classmethod(lambda cls: make_paths(tmp_path)))
    result = CliRunner().invoke(app, ["build", "nope"])
    assert result.exit_code == 1
    assert "No config for 'nope'" in result.output


def test_verbose_never_logs_r2_request_headers(monkeypatch, tmp_path, caplog):
    monkeypatch.setattr(Paths, "default", classmethod(lambda cls: make_paths(tmp_path)))
    with caplog.at_level(logging.DEBUG):
        CliRunner().invoke(app, ["-v", "build", "nope"])
        logging.getLogger("botocore.endpoint").debug("Credential=AKIA-TEST/...")
    assert "AKIA-TEST" not in caplog.text


def test_build_skips_a_truncated_photo_with_a_warning(tmp_path, caplog):
    paths = make_paths(tmp_path)
    truncated = write_jpeg(
        paths.inputs / "demo" / "photos" / "IMG_2.jpg",
        "2026:07:12 05:10:00",
        "-06:00",
        size=(800, 600),
    )
    data = truncated.read_bytes()
    truncated.write_bytes(data[: len(data) // 2])
    with caplog.at_level(logging.WARNING):
        result = build_hike("demo", paths, fake_sources(), SMALL)
    assert [p.caption for p in result.manifest.photos] == ["Top"]
    assert "IMG_2.jpg" in caplog.text
