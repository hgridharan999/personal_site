import pytest
from sample import sample_manifest

from flyover.coverage import from_rows
from flyover.tilestore import LocalStore
from flyover.upload import (
    IMMUTABLE,
    MANIFEST_CACHE,
    UploadError,
    load_settings,
    manifest_keys,
    upload_hike,
)

SETTINGS = {
    "R2_ACCOUNT_ID": "acct",
    "R2_ACCESS_KEY_ID": "AKIA-TEST",
    "R2_SECRET_ACCESS_KEY": "shh-test-only",
    "R2_BUCKET": "flyover",
}


class FakeS3:
    def __init__(self, existing=()):
        self.objects = {k: None for k in existing}
        self.puts = []

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        fake = self

        class Paginator:
            def paginate(self, Bucket, Prefix):  # noqa: N803 (boto3's argument names)
                keys = sorted(k for k in fake.objects if k.startswith(Prefix))
                for i in range(0, max(len(keys), 1), 2):  # tiny pages to exercise pagination
                    yield {"Contents": [{"Key": k} for k in keys[i : i + 2]]} if keys else {}

        return Paginator()

    def put_object(self, **kw):
        self.puts.append(kw)
        self.objects[kw["Key"]] = kw["Body"]


def test_settings_from_env_file_with_environment_override(tmp_path):
    env = tmp_path / ".env"
    env.write_text("".join(f"{k}={v}\n" for k, v in SETTINGS.items()))
    s = load_settings(env, environ={"R2_BUCKET": "other"})
    assert (s.account_id, s.bucket) == ("acct", "other")
    assert "shh-test-only" not in repr(s) and "AKIA-TEST" not in repr(s)


def test_missing_settings_names_them_without_values(tmp_path):
    env = tmp_path / ".env"
    env.write_text("R2_ACCOUNT_ID=acct\nR2_SECRET_ACCESS_KEY=shh-test-only\n")
    with pytest.raises(UploadError) as e:
        load_settings(env, environ={})
    assert "R2_ACCESS_KEY_ID" in str(e.value) and "R2_BUCKET" in str(e.value)
    assert "shh-test-only" not in str(e.value)


def test_manifest_keys_cover_dem_img_photos():
    m = sample_manifest()
    tiles, photos, manifest_key = manifest_keys(m)
    n = sum(len(from_rows(rows)) for rows in m.tiles.coverage.values())
    n18 = len(from_rows(m.tiles.coverage["18"]))
    assert len(tiles) == 2 * n - n18  # every zoom has imagery; z18 has no DEM
    assert not any("/dem/18/" in k for k in tiles)
    assert photos == ["hikes/sample/photos/0123456789ab.webp"]
    assert manifest_key == "hikes/sample/manifest.json"


def _built_store(tmp_path, m):
    store = LocalStore(tmp_path)
    tiles, photos, manifest_key = manifest_keys(m)
    for key in (*tiles, *photos, manifest_key):
        store.put(key, b"data")
    return store, tiles


def test_upload_skips_existing_and_sends_the_manifest_last(tmp_path):
    m = sample_manifest()
    store, tiles = _built_store(tmp_path, m)
    s3 = FakeS3(existing=tiles[:3])
    result = upload_hike(s3, "flyover", store, m, workers=2)
    assert result.skipped == 3 and result.uploaded == len(tiles) - 3 + 2
    assert s3.puts[-1]["Key"] == "hikes/sample/manifest.json"
    assert s3.puts[-1]["CacheControl"] == MANIFEST_CACHE
    assert s3.puts[-1]["ContentType"] == "application/json"
    tile_put = next(p for p in s3.puts if p["Key"].startswith("tiles/"))
    assert tile_put["CacheControl"] == IMMUTABLE and tile_put["ContentType"] == "image/webp"
    assert not {p["Key"] for p in s3.puts} & set(tiles[:3])


def test_upload_refuses_an_incomplete_build(tmp_path):
    m = sample_manifest()
    store, tiles = _built_store(tmp_path, m)
    store.path(tiles[5]).unlink()
    with pytest.raises(UploadError, match="build first"):
        upload_hike(FakeS3(), "flyover", store, m)
