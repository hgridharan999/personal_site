"""Output layout: every file lives under pipeline/out/ at the same key it gets on R2."""

from __future__ import annotations

from pathlib import Path

TILESET_VERSION = "v1"


def write_atomic(dest: Path, data: bytes) -> None:
    """Write `data` to `dest` so an interrupted write never leaves a truncated file."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(dest)


def dem_key(z: int, x: int, y: int) -> str:
    return f"tiles/{TILESET_VERSION}/dem/{z}/{x}/{y}.webp"


def img_key(year: int, z: int, x: int, y: int) -> str:
    return f"tiles/{TILESET_VERSION}/img/{year}/{z}/{x}/{y}.webp"


def hike_key(slug: str, name: str) -> str:
    return f"hikes/{slug}/{name}"


class LocalStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def path(self, key: str) -> Path:
        return self.root / key

    def exists(self, key: str) -> bool:
        return self.path(key).is_file()

    def put(self, key: str, data: bytes) -> None:
        write_atomic(self.path(key), data)  # never leave a half-written tile a re-run would skip

    def size(self, key: str) -> int:
        return self.path(key).stat().st_size


def summarize(store: LocalStore, keys: list[str]) -> list[tuple[str, str, int, int]]:
    """(layer, zoom, file count, bytes) per layer and zoom, for the build's size report."""
    totals: dict[tuple[str, str], list[int]] = {}
    for key in keys:
        parts = key.split("/")
        if parts[0] == "tiles":
            layer = parts[2]
            zoom = parts[4] if layer == "img" else parts[3]
        else:
            layer, zoom = "hike", "-"
        row = totals.setdefault((layer, zoom), [0, 0])
        row[0] += 1
        row[1] += store.size(key)

    def order(item: tuple[tuple[str, str], list[int]]) -> tuple[str, int]:
        (layer, zoom), _ = item
        return layer, int(zoom) if zoom.isdigit() else -1

    return [(layer, zoom, n, b) for (layer, zoom), (n, b) in sorted(totals.items(), key=order)]
