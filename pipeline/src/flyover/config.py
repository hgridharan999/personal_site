"""Per-hike settings, read from pipeline/hikes/<slug>.toml."""

from __future__ import annotations

import tomllib
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from pydantic.alias_generators import to_camel

SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class ConfigError(Exception):
    """A hike config or its inputs are missing or invalid."""


class Playback(BaseModel):
    """Story-clock timing. Snake_case in the TOML, camelCase in the manifest."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    duration_s: float = Field(150.0, gt=0)  # whole flyover at 1x
    summit_s: float = Field(10.0, ge=0)
    photo_s: float = Field(2.5, ge=0)
    stop_s: float = Field(1.0, ge=0)


class HikeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str = Field(pattern=SLUG_PATTERN)
    name: str = Field(min_length=1)
    data_js_name: str = Field(min_length=1)  # the hike's `name` in src/ascent/data.js
    timezone: str | None = None  # default: looked up from the trailhead
    trim_start_m: float = Field(0.0, ge=0)
    trim_end_m: float = Field(0.0, ge=0)
    naip_year: int | None = None  # default: newest year covering the trail corridor
    photo_time_offset_s: float = 0.0  # added to every photo's capture time
    captions: dict[str, str] = Field(default_factory=dict)  # photo filename -> caption
    playback: Playback = Field(default_factory=Playback)

    @field_validator("timezone")
    @classmethod
    def _known_zone(cls, v: str | None) -> str | None:
        if v is not None:
            try:
                ZoneInfo(v)
            except (ZoneInfoNotFoundError, ValueError) as e:
                raise ValueError(f"unknown time zone {v!r}") from e
        return v


def load_config(hikes_dir: Path, slug: str) -> HikeConfig:
    path = hikes_dir / f"{slug}.toml"
    if not path.is_file():
        raise ConfigError(f"No config for '{slug}': expected {path}")
    with path.open("rb") as f:
        data = tomllib.load(f)
    declared = data.setdefault("slug", slug)
    if declared != slug:
        raise ConfigError(f"{path} declares slug '{declared}', expected '{slug}'")
    try:
        return HikeConfig.model_validate(data)
    except ValidationError as e:
        raise ConfigError(f"Invalid config {path}:\n{e}") from e
