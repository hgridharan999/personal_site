# Flyover M1 handoff, package B: photos, manifest, upload, tools and README

**For the agent picking this up:** this file is self-contained. You don't need the conversation that produced it.

## What this project is

Hari's personal site is getting drone-style 3D flyovers of his past hikes. Milestone 1 is an offline Python pipeline (`pipeline/`) that turns one hike's GPX track and original photos into:
- terrain-RGB elevation tiles from USGS 3DEP;
- NAIP aerial-imagery tiles;
- web-sized photos;
- a `manifest.json`.

It uploads all of that to Cloudflare R2, and later milestones will render it in three.js.

- **Design:** `docs/superpowers/specs/2026-09-27-hike-flyover-design.md` (§5 pipeline, §6 manifest).
- **Implementation plan:** `docs/superpowers/plans/2026-09-27-flyover-m1-pipeline.md`. It has 14 tasks. **Every code block in it was prototyped and verified before the plan was written** (85+ tests passing, ruff and black clean, and a live build against 3DEP and NAIP), so tasks are **verbatim transcription plus testing**, not design work.

## State when you start

Tasks 1–7 are complete, each reviewed, on branch `feat/flyover` at `26299fc` (58 tests passing).

| Task | Module | Commit |
|---|---|---|
| 1 | scaffold, `flyover.geo` | b3ed64d |
| 2 | `flyover.config` (HikeConfig, Playback) | 7d07386 |
| 3 | `flyover.track`, `tests/helpers.py` | 39009d3 |
| 4 | `flyover.stats` | 7055b1a |
| 5 | `flyover.terrain_rgb`, `flyover.tilestore` | 1a5b7a6 |
| 6 | `flyover.coverage` | 1f5a7ea |
| 7 | `flyover.dem`, `tests/dem_fakes.py` | 26299fc |

**Work is split into two packages that run in parallel:**
- **Package A** (another agent, working in `C:/Users/hgrid/jp-flyover` on `feat/flyover`): Task 8 (NAIP imagery), then merging your branch, Task 12 (CLI), the final review, and Task 14 with Hari.
- **Package B** (you): Tasks 9, 10, 11, and 13, in your own worktree and branch.

Your files and package A's files don't overlap, so the merge will be clean. Don't touch any file outside your list below.

## Setup (your own worktree; never work in `C:/Users/hgrid/jp-flyover`)

Two agents committing in one working tree would stage each other's files, so you need a separate one. Run in Git Bash:

```bash
cd C:/Users/hgrid/journal_portfolio
git worktree add C:/Users/hgrid/jp-flyover-b -b feat/flyover-b feat/flyover
cd C:/Users/hgrid/jp-flyover-b/pipeline
uv sync
uv run pytest            # baseline: 58 passed
```

Base your branch on the tip of `feat/flyover` at the moment you create it (`26299fc` or later). Everything below runs from `C:/Users/hgrid/jp-flyover-b/pipeline`.

## Ground rules (all tasks)

**Writing the code**
1. **Transcribe verbatim:** for each task, open that task's section of the plan and create the files exactly as written. Don't "improve", restructure, or reformat. The one approved deviation is listed under Task 13.
2. **TDD:** follow each task's steps in order. Write the fakes and tests first, run the focused test file, and see it fail the way the plan predicts (`ModuleNotFoundError` for the new module). Then implement and see the focused count pass. Keep the RED and GREEN output for your notes.

**Before committing**
3. **Full suite:** run `uv run pytest` once, with the expected total given per task below.
4. **Lint:** `uv run ruff check .` and `uv run black --check .` must both be clean.

**Committing**
5. **Message and files:** use the plan's subject line (sentence case, no type prefix) and commit only the files the task lists. Add a proper trailer:

   ```bash
   git commit -m "<subject from the plan>" -m "Co-Authored-By: <your model's attribution line>"
   ```

   The trailer names the model that actually makes the commit (the plan's literal "Claude Opus 5.5" text is superseded). Check the result with `git log -1 --format=%B`: subject line, blank line, trailer. Never pass `--no-verify`.

**Environment**
6. **Always use `uv run`.** This machine has PostGIS, which sets `PROJ_LIB` and `GDAL_DATA` system-wide and breaks rasterio's EPSG lookups. `src/flyover/__init__.py` clears them and `tests/conftest.py` imports `flyover` first. Never edit either file.
7. **Never read, print, or cat any `.env` file.** You'll create `.env.example` (placeholders only), never `.env`.

**When things go wrong, and what not to touch**
8. **Stop on surprises:** if a test fails even though your code matches the plan, or a dependency or import is missing, stop and report it. Don't patch verified code.
9. **Off-limits files:** `pyproject.toml`, `uv.lock`, `src/flyover/__init__.py`, `tests/conftest.py`, `tests/helpers.py`, any earlier task's module, and anything of package A's (`imagery.py`, `imagery_fakes.py`, `test_imagery.py`, `cli.py`, `test_cli.py`).

**Settled decisions (don't re-litigate)**
10. **Data models:** internal records are frozen `@dataclass`es. Pydantic v2 is only for `flyover.config` and `flyover.manifest`, per Hari's decision.
11. **Test layout:** tests live in `pipeline/tests/`.

**Review after every task.** If you can spawn subagents, have a separate reviewer check each task's diff for spec compliance and code quality.
- **Reviewer inputs:** `C:/Users/hgrid/jp-flyover/.superpowers/sdd/reviewer-instructions.md` (the rubric) and `C:/Users/hgrid/jp-flyover/.superpowers/sdd/global-constraints.md` (the binding constraints plus Hari's decisions).
- **Diff:** `git log --oneline BASE..HEAD; git diff --stat BASE..HEAD; git diff -U10 BASE..HEAD` into one file for the reviewer to read.
- **Findings:** fix Critical and Important findings before moving on. List Minor findings in your hand-back.

---

## B1: Task 9, Photos

**Plan section:** "### Task 9: Photos".

**Files:** `src/flyover/photos.py`, `tests/photo_fakes.py`, `tests/test_photos.py`.

**Uses from earlier tasks:** `flyover.geo.FloatArray` and `tests/helpers.START`.

**Produces:** these are the interfaces Task 10 imports.
- **Records:** `PlacedPhoto(source, t, idx, caption)` and `ExportedPhoto(src, t, idx, w, h, caption)`.
- **Functions:**
  - `capture_time(path, fallback_tz, offset_s=0.0) -> datetime | None`, in UTC.
  - `place_photos(paths, start, t, captions, fallback_tz, offset_s=0.0) -> list[PlacedPhoto]`: logs a warning and skips unsupported, untimed, or out-of-window photos.
  - `export_photo(path, max_px=1600, quality=82) -> (name, data, w, h)`: upright, EXIF stripped, content-hashed `<12 hex>.webp`.

**What matters:**
- **Time zones on Windows:** `ZoneInfo("America/Denver")` needs the `tzdata` package, which is already in pyproject.
- **Formats:** HEIC is intentionally unsupported, and the test expects a warning naming it.
- **Privacy:** the exported WebP must carry no EXIF (capture time or GPS).

**Accept when:**
- `uv run pytest tests/test_photos.py` gives **8 passed**, and the full suite gives **66 passed**.
- ruff and black are clean.

**Commit subject:** `Place photos on the track by capture time and export web copies`

## B2: Task 10, The manifest

**Plan section:** "### Task 10: The manifest".

**Files:** `src/flyover/manifest.py`, `tests/sample.py`, `tests/test_manifest.py`, and the **generated** `tests/fixtures/manifest.sample.json`.

**Uses from earlier tasks:**
- `flyover.config.Playback`
- `flyover.coverage` (`DEM_MAX_ZOOM`, `IMG_MAX_ZOOM`, `Coverage`, `coverage_rows`)
- `flyover.photos.ExportedPhoto` (from B1)
- `flyover.stats` (`Stop`, `TrackStats`)
- `flyover.tilestore.TILESET_VERSION`
- `flyover.track.Resampled`

**Produces:**
- **`ATTRIBUTION`**
- **Models:** `LatLon`, `TilesInfo`, `TrackColumns`, `Stop`, `Summit`, `Stats`, `Photo`, and `Manifest`. All are Pydantic v2, frozen, `extra="forbid"`, and serialize to camelCase.
- **`build_manifest(*, slug, name, timezone, playback, track, ele, stops, moving, stats, coverage, naip_year, photos) -> Manifest`**
- **`to_json(m) -> bytes`**
- **`tests/sample.py`:** `sample_manifest()`

**What matters:**
- **The fixture is a contract.** `test_sample_manifest_fixture_is_current` regenerates `tests/fixtures/manifest.sample.json` on every run, and the output is deterministic. Milestone 2's Zod schema will be tested against that file, so **commit it**.
- **Sanity check:** `head -c 300 tests/fixtures/manifest.sample.json` starts with `{"version":1,"slug":"sample","name":"Sample Peak","startTime":"2026-07-12T11:00:00Z"`.
- **Wire format:** JSON keys are camelCase (`startTime`, `ascentRateMPerH`, `demZooms`, and so on), and `startTime` ends in `Z`.

**Accept when:**
- `uv run pytest tests/test_manifest.py` gives **5 passed**, and the full suite gives **71 passed**.
- The fixture file is committed.

**Commit subject:** `Define the flyover manifest and its contract fixture`

## B3: Task 11, Upload to R2

**Plan section:** "### Task 11: Upload to R2".

**Files:** `src/flyover/upload.py`, `.env.example`, `tests/test_upload.py`.

**Uses from earlier tasks:** `flyover.coverage.from_rows`, `flyover.manifest.Manifest`, `flyover.tilestore` (`LocalStore`, `dem_key`, `img_key`, `hike_key`), and `tests/sample.sample_manifest`.

**Produces:**
- **`UploadError`**, plus `REQUIRED`, `IMMUTABLE`, `MANIFEST_CACHE`, and `CONTENT_TYPES`.
- **`R2Settings`:** secrets hidden from `repr`.
- **Setup:** `load_settings(env_file, environ=os.environ)` and `make_client(settings)`.
- **Upload:** `manifest_keys(m)`, `existing_keys(client, bucket, prefixes)`, `UploadResult(uploaded, skipped)`, and `upload_hike(client, bucket, store, m, workers=8)`.

**What matters:**
- **Secrets:**
  - Settings come from `pipeline/.env`, overridden by the real environment.
  - Error messages name missing variables but never print their values.
  - `repr(R2Settings)` must not contain the key or the secret.
- **Upload order:**
  - Tiles and photos go up first, get `Cache-Control: public, max-age=31536000, immutable`, and are skipped if they already exist on R2.
  - The manifest goes **last**, with `public, max-age=300`.
- **Local check:** `upload_hike` refuses an incomplete local build.
- **No network:** tests use the in-file `FakeS3`. Never create a real `.env` or call R2.

**Accept when:**
- `uv run pytest tests/test_upload.py` gives **5 passed**, and the full suite gives **76 passed**.

**Commit subject:** `Upload built hikes to R2, manifest last`

## B4: Task 13, Check tools and README

**Plan section:** "### Task 13: Check tools and README".

**Files:** `tools/check_dem.py`, `tools/preview.html`, `README.md`, all under `pipeline/`.

**Uses from earlier tasks:** `flyover.coverage.from_rows`, `flyover.geo`, `flyover.manifest.Manifest` (from B2), `flyover.terrain_rgb.from_webp`, and `flyover.tilestore`.

**What matters:**
- **Not tested here:** these tools are exercised later, against a real build in Task 14. For this task, confirm only that they lint cleanly and that `uv run python -c "import ast,sys; ast.parse(open('tools/check_dem.py').read())"` succeeds. Don't run `check_dem.py`, since no build exists.
- **Commands that don't exist yet:** the README documents `uv run flyover build/upload/build-all`, which package A's Task 12 adds later. That's expected.
- **The one approved deviation:** the plan's README text was corrected at line ~4302. It now says the fakes live in `tests/dem_fakes.py`, `tests/imagery_fakes.py`, and `FakeS3` in `tests/test_upload.py`. Transcribe the corrected plan text.

**Accept when:**
- ruff and black are clean, and the full suite is still **76 passed**.

**Commit subject:** `Add build check tools and the pipeline README`

---

## B5: Hand back

When B1–B4 are committed on `feat/flyover-b`, don't merge, rebase, or push. Package A merges your branch into `feat/flyover`. Then report:
- the branch name and head SHA, plus `git log --oneline feat/flyover..feat/flyover-b`;
- the final `uv run pytest` summary (expected **76 passed**) and the ruff and black results;
- any Minor review findings you didn't fix, and any concern or deviation from the plan.

Leave the `C:/Users/hgrid/jp-flyover-b` worktree in place until package A confirms the merge.
