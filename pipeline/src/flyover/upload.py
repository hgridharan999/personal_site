"""Push a built hike to Cloudflare R2 over its S3-compatible API."""

from __future__ import annotations

import os
from collections.abc import Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import boto3
from dotenv import dotenv_values

from flyover.coverage import from_rows
from flyover.manifest import Manifest
from flyover.tilestore import LocalStore, dem_key, hike_key, img_key

REQUIRED = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")
IMMUTABLE = "public, max-age=31536000, immutable"
MANIFEST_CACHE = "public, max-age=300"
CONTENT_TYPES = {".webp": "image/webp", ".json": "application/json"}


class UploadError(Exception):
    """Missing settings or a failed upload."""


@dataclass(frozen=True)
class R2Settings:
    account_id: str
    access_key_id: str = field(repr=False)
    secret_access_key: str = field(repr=False)
    bucket: str


def load_settings(env_file: Path, environ: Mapping[str, str] = os.environ) -> R2Settings:
    """Settings from `env_file`, overridden by real environment variables. Never logs values."""
    values = {k: v for k, v in dotenv_values(env_file).items() if v} if env_file.is_file() else {}
    values.update({k: v for k, v in environ.items() if k in REQUIRED and v})
    missing = [k for k in REQUIRED if k not in values]
    if missing:
        raise UploadError(f"Missing R2 settings: {', '.join(missing)} (set them in {env_file})")
    return R2Settings(
        account_id=values["R2_ACCOUNT_ID"],
        access_key_id=values["R2_ACCESS_KEY_ID"],
        secret_access_key=values["R2_SECRET_ACCESS_KEY"],
        bucket=values["R2_BUCKET"],
    )


def make_client(s: R2Settings) -> Any:
    return boto3.client(
        "s3",
        endpoint_url=f"https://{s.account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=s.access_key_id,
        aws_secret_access_key=s.secret_access_key,
        region_name="auto",
    )


def manifest_keys(m: Manifest) -> tuple[list[str], list[str], str]:
    """(tile keys, photo keys, manifest key) that a built hike needs on R2."""
    tiles: list[str] = []
    dem_max = m.tiles.dem_zooms[1]
    for z_str, rows in sorted(m.tiles.coverage.items(), key=lambda kv: int(kv[0])):
        z = int(z_str)
        for x, y in sorted(from_rows(rows)):
            if z <= dem_max:
                tiles.append(dem_key(z, x, y))
            tiles.append(img_key(m.tiles.naip_year, z, x, y))
    photos = [hike_key(m.slug, p.src) for p in m.photos]
    return tiles, photos, hike_key(m.slug, "manifest.json")


def existing_keys(client: Any, bucket: str, prefixes: list[str]) -> set[str]:
    found: set[str] = set()
    paginator = client.get_paginator("list_objects_v2")
    for prefix in prefixes:
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            found.update(obj["Key"] for obj in page.get("Contents", []))
    return found


@dataclass(frozen=True)
class UploadResult:
    uploaded: int
    skipped: int


def upload_hike(
    client: Any, bucket: str, store: LocalStore, m: Manifest, workers: int = 8
) -> UploadResult:
    tiles, photos, manifest_key = manifest_keys(m)
    prefixes = sorted({k.rsplit("/", 2)[0] + "/" for k in tiles}) + [hike_key(m.slug, "")]
    have = existing_keys(client, bucket, prefixes)
    todo = [k for k in (*tiles, *photos) if k not in have]
    missing_locally = [k for k in (*todo, manifest_key) if not store.exists(k)]
    if missing_locally:
        raise UploadError(
            f"{len(missing_locally)} files missing locally, e.g. {missing_locally[0]}; build first"
        )

    def put(key: str, cache_control: str) -> None:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=store.path(key).read_bytes(),
            ContentType=CONTENT_TYPES[Path(key).suffix],
            CacheControl=cache_control,
        )

    with ThreadPoolExecutor(workers) as pool:
        list(pool.map(lambda k: put(k, IMMUTABLE), todo))
    put(manifest_key, MANIFEST_CACHE)  # last, so a live manifest never points at missing tiles
    return UploadResult(uploaded=len(todo) + 1, skipped=len(tiles) + len(photos) - len(todo))
