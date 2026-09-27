"""`flyover build <slug>`, `flyover upload <slug>`, `flyover build-all`."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo

import typer
from timezonefinder import TimezoneFinder

from flyover.config import ConfigError, load_config
from flyover.coverage import (
    CORRIDOR_RADII_M,
    RING_RADIUS_M,
    compute_coverage,
    dem_coverage,
    tile_centers_lonlat,
    tiles_lonlat_bbox,
)
from flyover.dem import DemError, DemSource, UsgsDemSource, build_dem_tiles, sample_elevations
from flyover.imagery import (
    CogReader,
    ImageryError,
    ImageryReader,
    LonLatBox,
    NaipItem,
    build_img_tiles,
    choose_year,
    search_naip,
)
from flyover.manifest import Manifest, build_manifest, to_json
from flyover.photos import ExportedPhoto, export_photo, place_photos
from flyover.stats import compute_stats, detect_stops
from flyover.tilestore import LocalStore, hike_key, summarize
from flyover.track import TrackError, clean, decimate, parse_gpx, smooth_and_resample, trim
from flyover.upload import UploadError, load_settings, make_client, upload_hike

log = logging.getLogger("flyover")
PIPELINE_DIR = Path(__file__).resolve().parents[2]
BUDGET_BYTES = 80 * 1024 * 1024
KNOWN_ERRORS = (ConfigError, TrackError, DemError, ImageryError, UploadError)

app = typer.Typer(help="Build and upload hike flyover tiles.", no_args_is_help=True)


@dataclass(frozen=True)
class Paths:
    hikes: Path
    inputs: Path
    out: Path
    cache: Path
    env_file: Path

    @classmethod
    def default(cls) -> Paths:
        return cls(
            hikes=PIPELINE_DIR / "hikes",
            inputs=PIPELINE_DIR / "input",
            out=PIPELINE_DIR / "out",
            cache=PIPELINE_DIR / ".cache",
            env_file=PIPELINE_DIR / ".env",
        )


@dataclass(frozen=True)
class Sources:
    dem: DemSource
    imagery: ImageryReader
    search: Callable[[LonLatBox, Path], list[NaipItem]]

    @classmethod
    def real(cls, cache: Path) -> Sources:
        return cls(dem=UsgsDemSource(cache), imagery=CogReader(), search=search_naip)


@dataclass(frozen=True)
class Radii:
    corridor_m: dict[int, float] = field(default_factory=lambda: dict(CORRIDOR_RADII_M))
    ring_m: float = RING_RADIUS_M


@dataclass(frozen=True)
class BuildResult:
    manifest: Manifest
    keys: list[str]


def build_hike(
    slug: str, paths: Paths, sources: Sources, radii: Radii | None = None
) -> BuildResult:
    radii = radii or Radii()
    cfg = load_config(paths.hikes, slug)
    gpx = paths.inputs / slug / "track.gpx"
    if not gpx.is_file():
        raise ConfigError(f"Missing GPX for '{slug}': expected {gpx}")

    raw = decimate(trim(clean(parse_gpx(gpx)), cfg.trim_start_m, cfg.trim_end_m))
    track = smooth_and_resample(raw)
    log.info("track: %d points over %.1f km", len(track.t), track.dist[-1] / 1000)
    ele = sample_elevations(sources.dem, track.lat, track.lon)
    stops, moving = detect_stops(track.t, track.dist)
    stats = compute_stats(track.t, track.dist, ele, moving)

    store = LocalStore(paths.out)
    cov = compute_coverage(track.lat, track.lon, radii.corridor_m, radii.ring_m)
    log.info(
        "coverage: %d tiles across zooms %d-%d", sum(map(len, cov.values())), min(cov), max(cov)
    )
    keys = build_dem_tiles(dem_coverage(cov), sources.dem, store)

    min_zoom = min(cov)
    items = sources.search(tiles_lonlat_bbox(min_zoom, cov[min_zoom]), paths.cache)
    corridor_zoom = max(z for z in cov if z <= 17)
    year = cfg.naip_year or choose_year(
        items, *tile_centers_lonlat(corridor_zoom, cov[corridor_zoom])
    )
    log.info("imagery: NAIP %d", year)
    keys += build_img_tiles(cov, items, year, sources.imagery, store)

    zone = cfg.timezone or TimezoneFinder().timezone_at(
        lng=float(track.lon[0]), lat=float(track.lat[0])
    )
    if zone is None:
        raise ConfigError(f"No time zone found at the trailhead; set `timezone` in {slug}.toml")
    photo_dir = paths.inputs / slug / "photos"
    placed = place_photos(
        sorted(photo_dir.iterdir()) if photo_dir.is_dir() else [],
        track.start,
        track.t,
        cfg.captions,
        ZoneInfo(zone),
        cfg.photo_time_offset_s,
    )
    exported: list[ExportedPhoto] = []
    for p in placed:
        name, data, w, h = export_photo(p.source)
        key = hike_key(slug, f"photos/{name}")
        store.put(key, data)
        keys.append(key)
        exported.append(ExportedPhoto(f"photos/{name}", p.t, p.idx, w, h, p.caption))

    manifest = build_manifest(
        slug=slug,
        name=cfg.name,
        timezone=zone,
        playback=cfg.playback,
        track=track,
        ele=ele,
        stops=stops,
        moving=moving,
        stats=stats,
        coverage=cov,
        naip_year=year,
        photos=exported,
    )
    manifest_key = hike_key(slug, "manifest.json")
    store.put(manifest_key, to_json(manifest))
    keys.append(manifest_key)
    return BuildResult(manifest=manifest, keys=keys)


def report(store: LocalStore, keys: list[str]) -> str:
    rows = summarize(store, keys)
    lines = [f"{'layer':<6}{'zoom':>5}{'files':>8}{'MB':>9}"]
    lines += [f"{layer:<6}{zoom:>5}{n:>8}{b / 1_048_576:>9.2f}" for layer, zoom, n, b in rows]
    total = sum(b for *_, b in rows)
    lines.append(f"{'total':<11}{sum(n for _, _, n, _ in rows):>8}{total / 1_048_576:>9.2f}")
    if total > BUDGET_BYTES:
        lines.append(
            f"WARNING: over the {BUDGET_BYTES // 1_048_576} MB budget; shrink CORRIDOR_RADII_M"
        )
    return "\n".join(lines)


def _run(action: Callable[[], None]) -> None:
    try:
        action()
    except KNOWN_ERRORS as e:
        typer.echo(f"error: {e}", err=True)
        raise typer.Exit(1) from e


@app.callback()
def _setup(verbose: bool = typer.Option(False, "--verbose", "-v")) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO, format="%(levelname)s %(message)s"
    )
    logging.getLogger("httpx").setLevel(logging.DEBUG if verbose else logging.WARNING)


@app.command()
def build(slug: str) -> None:
    """Build one hike's tiles, photos, and manifest into pipeline/out/."""

    def action() -> None:
        paths = Paths.default()
        result = build_hike(slug, paths, Sources.real(paths.cache))
        typer.echo(report(LocalStore(paths.out), result.keys))

    _run(action)


@app.command()
def upload(slug: str) -> None:
    """Upload a built hike to R2 (tiles and photos first, the manifest last)."""

    def action() -> None:
        paths = Paths.default()
        store = LocalStore(paths.out)
        manifest_path = store.path(hike_key(slug, "manifest.json"))
        if not manifest_path.is_file():
            raise UploadError(f"No build for '{slug}': run `flyover build {slug}` first")
        manifest = Manifest.model_validate_json(manifest_path.read_bytes())
        settings = load_settings(paths.env_file)
        result = upload_hike(make_client(settings), settings.bucket, store, manifest)
        typer.echo(f"uploaded {result.uploaded} files, {result.skipped} already on R2")

    _run(action)


@app.command("build-all")
def build_all() -> None:
    """Build every hike in pipeline/hikes/ that has a GPX in pipeline/input/."""

    def action() -> None:
        paths = Paths.default()
        sources = Sources.real(paths.cache)
        for config in sorted(paths.hikes.glob("*.toml")):
            slug = config.stem
            if not (paths.inputs / slug / "track.gpx").is_file():
                typer.echo(f"skip {slug}: no pipeline/input/{slug}/track.gpx")
                continue
            result = build_hike(slug, paths, sources)
            typer.echo(f"\n{slug}\n{report(LocalStore(paths.out), result.keys)}")

    _run(action)
