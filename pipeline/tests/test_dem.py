import httpx
import numpy as np
import pytest
from dem_fakes import PlaneDem, geotiff_bytes
from helpers import TRAILHEAD

from flyover.dem import (
    EXPORT_URL,
    DemError,
    UsgsDemSource,
    build_dem_tiles,
    fetch_mosaic,
    sample_elevations,
)
from flyover.geo import TILE_PX, Bounds, from_local_m, lonlat_to_merc, lonlat_to_tile, tile_bounds
from flyover.terrain_rgb import from_webp
from flyover.tilestore import LocalStore, dem_key

Z = 15
X, Y = lonlat_to_tile(Z, TRAILHEAD[1], TRAILHEAD[0])


def test_tile_pixels_are_sampled_at_centers_with_a_one_pixel_border(tmp_path):
    dem, store = PlaneDem(), LocalStore(tmp_path)
    build_dem_tiles({Z: {(X, Y)}}, dem, store)
    h = from_webp(store.path(dem_key(Z, X, Y)).read_bytes())
    assert h.shape == (TILE_PX + 2, TILE_PX + 2)
    b = tile_bounds(Z, X, Y)
    px = (b.maxx - b.minx) / TILE_PX
    for r, c in [(0, 0), (1, 1), (128, 40), (257, 257)]:
        expected = dem.height_at(b.minx + (c - 0.5) * px, b.maxy - (r - 0.5) * px)
        assert h[r, c] == pytest.approx(expected, abs=0.06), (r, c)


def test_neighbor_borders_match(tmp_path):
    store = LocalStore(tmp_path)
    build_dem_tiles({Z: {(X, Y), (X + 1, Y)}}, PlaneDem(), store)
    left = from_webp(store.path(dem_key(Z, X, Y)).read_bytes())
    right = from_webp(store.path(dem_key(Z, X + 1, Y)).read_bytes())
    assert np.array_equal(left[:, 257], right[:, 1])  # left's border = right's first column
    assert np.array_equal(left[:, 256], right[:, 0])  # left's last column = right's border


def test_existing_tiles_are_skipped(tmp_path):
    dem, store = PlaneDem(), LocalStore(tmp_path)
    store.put(dem_key(Z, X, Y), b"already here")
    keys = build_dem_tiles({Z: {(X, Y)}}, dem, store)
    assert keys == [dem_key(Z, X, Y)] and dem.calls == []


def test_chunks_are_single_requests(tmp_path):
    dem = PlaneDem()
    tiles = {(X + i, Y + j) for i in range(3) for j in range(2)}
    build_dem_tiles({Z: tiles}, dem, LocalStore(tmp_path), chunk=16)
    assert len(dem.calls) <= 4  # at most one per aligned 16x16 block the tiles touch
    assert sum(w * h for _, w, h in dem.calls) >= 6 * TILE_PX * TILE_PX


class PickyDem(PlaneDem):
    """Rejects any request wider or taller than `limit` pixels, like 3DEP's 500s."""

    def __init__(self, limit: int) -> None:
        super().__init__()
        self.limit = limit

    def fetch(self, bounds, width, height):
        if max(width, height) > self.limit:
            self.calls.append((bounds, width, height))
            raise DemError("500 Internal Server Error")
        return super().fetch(bounds, width, height)


def test_rejected_requests_are_split_into_identical_halves(tmp_path):
    tiles = {(X + i, Y + j) for i in range(3) for j in range(2)}
    plain, picky = LocalStore(tmp_path / "plain"), LocalStore(tmp_path / "picky")
    build_dem_tiles({Z: tiles}, PlaneDem(), plain)
    build_dem_tiles({Z: tiles}, PickyDem(limit=300), picky)
    for x, y in tiles:
        key = dem_key(Z, x, y)
        assert np.array_equal(
            from_webp(plain.path(key).read_bytes()), from_webp(picky.path(key).read_bytes())
        )


def test_split_gives_up_below_the_minimum_size():
    with pytest.raises(DemError):
        fetch_mosaic(PickyDem(limit=100), Bounds(0.0, 0.0, 1000.0, 1000.0), 300, 300)


def test_fetch_mosaic_stitches_sub_requests():
    dem = PlaneDem()
    mx, my = (float(v) for v in lonlat_to_merc(TRAILHEAD[1], TRAILHEAD[0]))
    b = Bounds(mx, my, mx + 300, my + 200)
    whole = dem.fetch(b, 150, 100)
    assert np.allclose(fetch_mosaic(dem, b, 150, 100, max_px=64), whole, atol=1e-3)


def test_sample_elevations_is_bilinear_on_a_plane():
    dem = PlaneDem()
    lat, lon = from_local_m(
        np.array([0.0, 400.0, 900.0]), np.array([0.0, 700.0, 1500.0]), *TRAILHEAD
    )
    got = sample_elevations(dem, lat, lon, max_px=512)
    mx, my = lonlat_to_merc(lon, lat)
    expected = [dem.height_at(float(a), float(b)) for a, b in zip(mx, my, strict=True)]
    assert np.allclose(got, expected, atol=0.01)
    assert len(dem.calls) > 1  # exercised the mosaic path


def _source(tmp_path, handler):
    return UsgsDemSource(
        tmp_path, client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None
    )


def test_usgs_source_requests_3857_float_tiff_and_caches(tmp_path):
    seen = []

    def handler(request):
        seen.append(request)
        q = request.url.params
        minx, miny, maxx, maxy = (float(v) for v in q["bbox"].split(","))
        w, h = (int(v) for v in q["size"].split(","))
        heights = np.full((h, w), 4348.0, dtype=np.float32)
        return httpx.Response(
            200,
            headers={"content-type": "image/tiff"},
            content=geotiff_bytes(Bounds(minx, miny, maxx, maxy), heights),
        )

    src = _source(tmp_path, handler)
    b = Bounds(0.0, 0.0, 100.0, 50.0)
    a = src.fetch(b, 20, 10)
    assert a.shape == (10, 20) and float(a[0, 0]) == 4348.0
    q = seen[0].url.params
    assert str(seen[0].url).startswith(EXPORT_URL)
    assert (q["bboxSR"], q["imageSR"], q["pixelType"], q["format"], q["size"]) == (
        "3857",
        "3857",
        "F32",
        "tiff",
        "20,10",
    )
    src.fetch(b, 20, 10)
    assert len(seen) == 1  # second call came from pipeline/.cache


def test_usgs_source_retries_then_succeeds(tmp_path):
    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) < 3:
            return httpx.Response(503, text="busy")
        return httpx.Response(
            200,
            headers={"content-type": "image/tiff"},
            content=geotiff_bytes(Bounds(0, 0, 10, 10), np.zeros((4, 4))),
        )

    assert _source(tmp_path, handler).fetch(Bounds(0, 0, 10, 10), 4, 4).shape == (4, 4)
    assert len(calls) == 3


def test_usgs_source_gives_up_on_error_json(tmp_path):
    def handler(request):
        return httpx.Response(
            200, headers={"content-type": "application/json"}, json={"error": {"code": 400}}
        )

    with pytest.raises(DemError, match="3 attempts"):
        _source(tmp_path, handler).fetch(Bounds(0, 0, 10, 10), 4, 4)
