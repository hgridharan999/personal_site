"""The manifest: the one file the viewer reads per hike. Mirrored by a Zod schema on the site."""

from __future__ import annotations

from datetime import datetime
from itertools import pairwise
from typing import Literal

import numpy as np
import numpy.typing as npt
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from flyover.config import Playback
from flyover.coverage import DEM_MAX_ZOOM, IMG_MAX_ZOOM, Coverage, coverage_rows
from flyover.photos import ExportedPhoto
from flyover.stats import Stop as TrackStop
from flyover.stats import TrackStats
from flyover.tilestore import TILESET_VERSION
from flyover.track import Resampled

ATTRIBUTION = "Elevation: USGS 3DEP · Imagery: USDA NAIP"


class _Model(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True
    )


class LatLon(_Model):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class TilesInfo(_Model):
    version: str
    naip_year: int
    dem_zooms: tuple[int, int]
    img_zooms: tuple[int, int]
    coverage: dict[str, list[tuple[int, int, int]]]  # zoom -> [y, xStart, xEnd] rows


class TrackColumns(_Model):
    t: list[float]
    lat: list[float]
    lon: list[float]
    ele: list[float]
    dist: list[float]
    moving: list[Literal[0, 1]]

    @model_validator(mode="after")
    def _consistent(self) -> TrackColumns:
        n = len(self.t)
        if n < 2:
            raise ValueError("track needs at least 2 points")
        if any(len(c) != n for c in (self.lat, self.lon, self.ele, self.dist, self.moving)):
            raise ValueError("track columns must all have the same length")
        if any(b < a for a, b in pairwise(self.t)):
            raise ValueError("track.t must be non-decreasing")
        if any(b < a for a, b in pairwise(self.dist)):
            raise ValueError("track.dist must be non-decreasing")
        return self


class Stop(_Model):
    start_idx: int = Field(ge=0)
    end_idx: int = Field(ge=0)
    seconds: float = Field(ge=0)


class Summit(_Model):
    idx: int = Field(ge=0)
    lat: float
    lon: float
    ele: float


class Stats(_Model):
    distance_m: float = Field(ge=0)
    gain_m: float = Field(ge=0)
    moving_s: float = Field(ge=0)
    total_s: float = Field(ge=0)
    ascent_rate_m_per_h: float = Field(ge=0)


class Photo(_Model):
    src: str
    t: float = Field(ge=0)
    idx: int = Field(ge=0)
    w: int = Field(gt=0)
    h: int = Field(gt=0)
    caption: str | None = None


class Manifest(_Model):
    version: Literal[1] = 1
    slug: str
    name: str
    start_time: datetime
    timezone: str
    origin: LatLon
    tiles: TilesInfo
    track: TrackColumns
    stops: list[Stop]
    summit: Summit
    stats: Stats
    photos: list[Photo]
    playback: Playback
    attribution: str = ATTRIBUTION

    @model_validator(mode="after")
    def _indices_in_range(self) -> Manifest:
        n = len(self.track.t)
        if self.start_time.tzinfo is None:
            raise ValueError("startTime must be timezone-aware")
        idx = [self.summit.idx, *(p.idx for p in self.photos)]
        idx += [i for s in self.stops for i in (s.start_idx, s.end_idx)]
        if any(i >= n for i in idx):
            raise ValueError(f"an index points past the {n}-point track")
        return self


def _r(values: npt.ArrayLike, digits: int) -> list[float]:
    return [round(float(v), digits) for v in np.asarray(values)]


def build_manifest(
    *,
    slug: str,
    name: str,
    timezone: str,
    playback: Playback,
    track: Resampled,
    ele: npt.ArrayLike,
    stops: list[TrackStop],
    moving: npt.ArrayLike,
    stats: TrackStats,
    coverage: Coverage,
    naip_year: int,
    photos: list[ExportedPhoto],
) -> Manifest:
    ele_r = _r(ele, 1)
    s = stats.summit_idx
    min_zoom = min(coverage)
    return Manifest(
        slug=slug,
        name=name,
        start_time=track.start,
        timezone=timezone,
        origin=LatLon(lat=round(float(track.lat[0]), 6), lon=round(float(track.lon[0]), 6)),
        tiles=TilesInfo(
            version=TILESET_VERSION,
            naip_year=naip_year,
            dem_zooms=(min_zoom, DEM_MAX_ZOOM),
            img_zooms=(min_zoom, IMG_MAX_ZOOM),
            coverage=coverage_rows(coverage),
        ),
        track=TrackColumns(
            t=_r(track.t, 1),
            lat=_r(track.lat, 6),
            lon=_r(track.lon, 6),
            ele=ele_r,
            dist=_r(track.dist, 1),
            moving=[int(v) for v in np.asarray(moving)],
        ),
        stops=[
            Stop(start_idx=x.start_idx, end_idx=x.end_idx, seconds=round(x.seconds, 1))
            for x in stops
        ],
        summit=Summit(
            idx=s,
            lat=round(float(track.lat[s]), 6),
            lon=round(float(track.lon[s]), 6),
            ele=ele_r[s],
        ),
        stats=Stats(
            distance_m=round(stats.distance_m, 1),
            gain_m=round(stats.gain_m, 1),
            moving_s=round(stats.moving_s, 1),
            total_s=round(stats.total_s, 1),
            ascent_rate_m_per_h=round(stats.ascent_rate_m_per_h, 1),
        ),
        photos=[
            Photo(src=p.src, t=round(p.t, 1), idx=p.idx, w=p.w, h=p.h, caption=p.caption)
            for p in photos
        ],
        playback=playback,
    )


def to_json(m: Manifest) -> bytes:
    return m.model_dump_json(by_alias=True).encode()
