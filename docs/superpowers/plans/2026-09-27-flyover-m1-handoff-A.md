# Flyover M1 handoff, package A: imagery, integration, final review, ship

**For the agent picking this up:** this file is self-contained. You don't need the conversation that produced it.

## What this project is

Hari's personal site is getting drone-style 3D flyovers of his past hikes. Milestone 1 is an offline Python pipeline (`pipeline/`) that turns one hike's GPX track and original photos into:
- terrain-RGB elevation tiles from USGS 3DEP;
- NAIP aerial-imagery tiles;
- web-sized photos;
- a `manifest.json`.

It uploads all of that to Cloudflare R2, and later milestones will render it in three.js.

- **Design:** `docs/superpowers/specs/2026-09-27-hike-flyover-design.md` (§5 pipeline, §6 manifest, §13 open items).
- **Implementation plan:** `docs/superpowers/plans/2026-09-27-flyover-m1-pipeline.md`. It has 14 tasks. **Every code block in it was prototyped and verified before the plan was written** (85+ tests passing, ruff and black clean, and a live build against 3DEP and NAIP), so coding tasks are **verbatim transcription plus testing**, not design work.

## State when you start

You work in `C:/Users/hgrid/jp-flyover` (a git worktree) on branch `feat/flyover`. Tasks 1–7 are complete, each reviewed, at `26299fc` (58 tests passing).

| Task | Module | Commit |
|---|---|---|
| 1 | scaffold, `flyover.geo` | b3ed64d |
| 2 | `flyover.config` (HikeConfig, Playback) | 7d07386 |
| 3 | `flyover.track`, `tests/helpers.py` | 39009d3 |
| 4 | `flyover.stats` | 7055b1a |
| 5 | `flyover.terrain_rgb`, `flyover.tilestore` | 1a5b7a6 |
| 6 | `flyover.coverage` | 1f5a7ea |
| 7 | `flyover.dem`, `tests/dem_fakes.py` | 26299fc |

Task 8 was started and interrupted: `pipeline/tests/imagery_fakes.py` and `pipeline/tests/test_imagery.py` exist **untracked**. They were checked and are identical to the plan apart from Windows line endings. `src/flyover/imagery.py` does not exist yet.

**Work is split into two packages that run in parallel:**
- **Package A** (you): Task 8, then merging package B's branch, Task 12 (CLI), the final whole-branch review, and Task 14 with Hari.
- **Package B** (another agent, in its own worktree `C:/Users/hgrid/jp-flyover-b` on branch `feat/flyover-b`): Tasks 9 (photos), 10 (manifest), 11 (upload), and 13 (tools and README). Its brief is `docs/superpowers/plans/2026-09-27-flyover-m1-handoff-B.md`.

The two packages touch disjoint files. Only you touch `feat/flyover`.

**Progress ledger and review kit** (gitignored, in `C:/Users/hgrid/jp-flyover/.superpowers/sdd/`):
- `progress.md`: per-task status and **the Minor-findings list the final review must triage**.
- `global-constraints.md`: the plan's binding constraints, plus Hari's recorded decisions and one correction at the end.
- `reviewer-instructions.md`: the spec-plus-quality review rubric.
- `implementer-instructions.md`: the rules for implementer subagents.

Append one line to `progress.md` as each task completes.

## Ground rules (all coding tasks)

**Writing the code**
1. **Transcribe verbatim:** create the files from the plan's task section exactly as written. Don't "improve", restructure, or reformat.
2. **TDD:** the failing test comes first (`ModuleNotFoundError` for the new module), then the implementation, then the focused count passing. Record the RED and GREEN output.

**Before committing**
3. **Full suite:** run `uv run pytest` once, with the expected totals given below.
4. **Lint:** `uv run ruff check .` and `uv run black --check .` must both be clean.

**Committing**
5. **Message and files:** use the plan's subject line and commit only the listed files. Add a proper trailer:

   ```bash
   git commit -m "<subject>" -m "Co-Authored-By: <your model's attribution line>"
   ```

   The trailer names the model that actually commits (this supersedes the plan's literal "Claude Opus 5.5" text). Check it with `git log -1 --format=%B`: subject line, blank line, trailer. Never skip hooks.

**Environment**
6. **Always use `uv run`,** from `C:/Users/hgrid/jp-flyover/pipeline`. PostGIS on this machine sets `PROJ_LIB` and `GDAL_DATA` system-wide. `src/flyover/__init__.py` clears them and `tests/conftest.py` imports `flyover` first. Never edit either file.
7. **Never read, print, or cat `.env`.** R2 credentials are Hari's.

**Settled decisions (don't re-litigate)**
8. **Data models:** internal records are frozen `@dataclass`es. Pydantic v2 is only for config and manifest, per Hari's decision.
9. **Test layout:** tests live in `pipeline/tests/`.

**Review after every task.** Use a separate reviewer subagent, giving it `reviewer-instructions.md`, `global-constraints.md`, the task's plan section, and a diff file (`git log --oneline B..H; git diff --stat B..H; git diff -U10 B..H`).
- **Findings:** fix Critical and Important findings before moving on, and add Minor findings to `progress.md`.
- **Plan conflicts:** if a finding conflicts with the plan's text, ask Hari which governs.

---

## A1: Task 8, NAIP imagery (start now, in parallel with package B)

**Plan section:** "### Task 8: NAIP imagery and imagery tiles".

**Files:** `src/flyover/imagery.py` (new), plus the already-present `tests/imagery_fakes.py` and `tests/test_imagery.py`. Resume at the plan's **Step 3**: run the tests, expect `ModuleNotFoundError: No module named 'flyover.imagery'`, then implement.

**Uses from earlier tasks:** `flyover.coverage` (`Coverage`, `Tile`, `chunk_tiles`), `flyover.geo`, and `flyover.tilestore` (`LocalStore`, `img_key`).

**Produces:** these are the interfaces Task 12 imports.
- **Types and errors:** `ImageryError`, `NaipItem(id, year, bbox, href)`, and `LonLatBox`.
- **Search and selection:**
  - `search_naip(bbox, cache_dir, open_client=...)`: all years, cached.
  - `choose_year(items, lon, lat)`
  - `order_items(items, year, bbox)`
- **Reading:** the `ImageryReader` protocol and `CogReader(sign=planetary_computer.sign)`.
- **Tiles:** `to_webp(rgb, quality=80)` and `build_img_tiles(cov, items, year, reader, store, chunk=8, workers=4)`.

**What matters.** All of this was learned live, so keep the code exactly as written:
- **Compositing:** `CogReader` layers scenes by coverage ("over" compositing of premultiplied reduced-size reads, then divides by total coverage). This produces seamless seams at zoomed-out levels. The simpler rules "any alpha wins" and "alpha == 255 wins" both failed on real data.
- **Warp margin:** `_warped` pads each scene's warped grid by one output pixel, so seam pixels can be read whole.
- **Mislabeled scenes:** scenes whose 4th (near-infrared) band is labeled alpha (Colorado 2017) are skipped.
- **Fake band layout:** `write_utm_rgb(..., photometric="RGB")` and its `alpha` switch are deliberate. Without `photometric="RGB"`, GDAL labels band 4 as alpha.
- **Affine:** `from rasterio.transform import Affine` and `transform @ Affine.translation(...)` (with `@`, not `*`, which warns).

**Accept when:**
- `uv run pytest tests/test_imagery.py` gives **7 passed**, and the full suite gives **65 passed**.
- ruff and black are clean, and the review is clean.

**Commit subject:** `Mosaic NAIP scenes into imagery tiles`

## A2: Merge package B

Wait until package B reports `feat/flyover-b` complete. It contains Tasks 9, 10, 11, and 13, and its suite should show 76 passed. Then run:

```bash
cd C:/Users/hgrid/jp-flyover
git log --oneline feat/flyover..feat/flyover-b          # expect 4 commits: photos, manifest, upload, tools+README
git merge --no-ff feat/flyover-b -m "Merge photos, manifest, upload, and check tools (package B)" -m "Co-Authored-By: <your model's attribution line>"
cd pipeline && uv run pytest                              # expect 83 passed (65 + 8 + 5 + 5)
```

The files are disjoint, so there should be no conflicts. If there is one, stop and report it. Don't resolve it by editing verified code. Package B's own reviews should already be clean, so don't re-review its tasks individually. The final review (A4) covers them.

## A3: Task 12, The build command

**Plan section:** "### Task 12: The build command".

**Files:** `src/flyover/cli.py` and `tests/test_cli.py`.

**Uses:** every module (imagery from A1; photos, manifest, and upload from package B). The test uses `tests/dem_fakes.PlaneDem`, `tests/imagery_fakes` (`SolidReader`, `naip`), `tests/photo_fakes.write_jpeg`, and `tests/helpers` (`synth_track`, `write_gpx`).

**Produces:** `Paths`, `Sources`, `Radii`, `BuildResult`, `build_hike(slug, paths, sources, radii=None)`, `report(store, keys)`, and the Typer `app` (`build`, `upload`, `build-all`), which is the `flyover` script already declared in `pyproject.toml`.

**What matters:**
- **Error handling:** known errors become `error: ...` and exit code 1.
- **Log noise:** httpx logging drops to WARNING unless `-v` is passed.
- **Offline test:** the end-to-end test runs completely offline, with small radii.

**Accept when:**
- `uv run pytest tests/test_cli.py` gives **3 passed**, and the full suite gives **86 passed**.
- `uv run flyover --help` lists `build`, `upload`, and `build-all`.
- ruff and black are clean, and the review is clean.

**Commit subject:** `Add the flyover build, upload, and build-all commands`

## A4: Final whole-branch review and one fix wave

1. **Build the package:** write a review package covering the pipeline commits, `git log --oneline 8e8a0cf..HEAD`, `git diff --stat 8e8a0cf..HEAD`, and `git diff -U10 8e8a0cf..HEAD -- . ':(exclude)pipeline/uv.lock'`, into one file.
2. **Review:** dispatch **one** reviewer on the most capable model available, with:
   - the spec and plan paths;
   - `global-constraints.md`;
   - the package file;
   - **the Minor-findings list from `progress.md`, with package B's reported minors added**, asking it to triage which must be fixed before merge.
3. **Must-fix list.** It must include at least this item from the Task 7 review: `UsgsDemSource.fetch` in `src/flyover/dem.py` writes the cache file before `_decode` validates the response. A malformed 200/tiff response would then be cached forever. The fix is to decode first and write the cache only on success, with a test that a bad response isn't cached.
4. **Fix wave:** dispatch **one** fix subagent with the complete must-fix list, not one per finding. It re-runs the covering tests plus the full suite, ruff, and black. Expected: 86 or more passed, and clean.
5. **Check the plan's Task 14 steps** against the final code, especially the command names and the tool paths.

## A5: Task 14, Build and ship Quandary (with Hari)

**Plan section:** "### Task 14: Build and ship Quandary (with Hari)". Stop at every **(Hari)** step and ask. Never touch credentials yourself.

1. **(Hari)** Hari puts Quandary's GPX at `pipeline/input/quandary/track.gpx` and the original photos in `pipeline/input/quandary/photos/`. Both folders are gitignored.
2. **Build:** `uv run flyover build quandary`. The report's total should be at most about 80 MB. A live test with a synthetic 8 km Quandary track gave 47.6 MB in about 7 min, and warnings like `3DEP rejected a ... request; fetching it in halves` are normal.
3. **Check the elevation:** `uv run python tools/check_dem.py quandary` should report a diff under 3 m (the synthetic test gave 0.06 m). Look at the hillshade PNG.
4. **Check the imagery:** from `pipeline/`, run `uv run python -m http.server 8000`, then open `http://localhost:8000/tools/preview.html?slug=quandary`. Imagery should line up with the track, with no black holes near the trail and no seam lines. Screenshot it for Hari.
5. **(Hari)** Hari does the R2 setup from the README:
   - bucket and scoped token, written into `pipeline/.env`;
   - the CORS policy with his production origin;
   - **the serving-domain decision** (spec §13, item 1): a custom domain needs DNS on Cloudflare, otherwise `r2.dev`.
6. **Upload:** `uv run flyover upload quandary`. Verify the headers with the `curl -sI` checks in the plan (manifest `application/json` with max-age 300, tile `image/webp` immutable, and the CORS header).
7. **Record:** commit any `hikes/quandary.toml` tweaks, and record the public base URL and the measured size in the spec's §13 (for milestone 2's `VITE_FLYOVER_BASE_URL`).

## Definition of done (milestone 1)

All of the following hold:
- Tasks 1–13 are merged on `feat/flyover`, with 86 or more tests passing and ruff and black clean.
- The final review's must-fix items are fixed.
- Quandary is built, checked, and uploaded, and all three header checks pass.

Then offer Hari the next step: milestone 2, the terrain viewer, which gets its own plan. Also tell him that `C:/Users/hgrid/jp-flyover-b` and the `feat/flyover-b` branch can be removed.
