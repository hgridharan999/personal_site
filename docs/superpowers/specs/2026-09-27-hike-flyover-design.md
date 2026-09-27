# Hike Flyover: Drone-Style 3D Replays of Past Hikes — Design

**Date:** 2026-09-27
**Status:** Approved (brainstorming and spec review)
**Scope:** An offline pipeline that turns a hike's GPX track into streamable satellite-textured terrain, and a full-screen viewer on the personal site that replays the hike as if a drone had followed it. This is the first slice of the broader Alpine Start idea (its "Relive" goals, G1 and R5–R11). The pace model, planner, 14er collection, and STL export are out of scope here and get their own specs later.

## 1. Goals and non-goals

**Goals**
- Replay any tracked hike on real terrain with real aerial imagery, realistic enough to read as drone footage on a laptop.
- Keep the whole thing inside the existing Vite site: no new backend, no API keys in the browser, no cost per view.
- A drone camera that plays by default; dragging hands the camera to the visitor, and letting go eases it back.
- Photos appear on screen at the exact spot on the trail where they were taken.
- A "topo" toggle that renders the same terrain as contour lines in the site's Ascent palette.
- Desktop-first. Phones get the same flyover at reduced quality.

**Non-goals (v1)**
- Pace prediction, start-time planning, forecasts, the 14er map, and STL export.
- Visitor uploads, accounts, or anything under `/me`.
- Offline use or video export.
- Terrain-cast shadows, snow matching the hike date, or fixing imagery stretch on vertical cliffs.
- Hikes outside the US (the data sources below cover the US only).
- An inline preview on `/hiking`. The flyover lives only on its own full-screen route.

## 2. Decisions made in brainstorming

| Decision | Choice | Why |
|---|---|---|
| First slice | 3D flyover for past hikes | Most visible part of the idea; the rest builds on its pipeline |
| Realism approach | Own pipeline: USGS 3DEP elevation + NAIP imagery, rendered with custom three.js | Full control of the look, no keys or per-view cost, strongest "built it" story |
| Rejected | Google Photorealistic 3D Tiles | Key in the browser, billing, required branding, no caching allowed, looks exactly like Google Earth |
| Rejected | Mapbox / MapLibre terrain | Looks like a map app; library limits the camera and atmosphere |
| Experience | Plays as a drone shot; visitor can take over | Directed shots by default, with the handoff as a technical showpiece |
| Placement | Full-screen route per hike, `/hiking/:slug` | Whole screen, shareable link, `/hiking` stays light |
| Phones | Desktop-first, phones degrade | Laptop quality is never compromised; phones still work |
| Tile hosting | Cloudflare R2 | 10 GB free, no bandwidth fees; tiles stay out of git and the Vercel deploy |

Facts checked in the repo during brainstorming:
- The user has timestamped GPX for most hikes.
- Original photos in `photos-original/` carry EXIF capture times but no GPS. The resized copies in `public/hikes/` have EXIF stripped, so the pipeline reads originals.
- The site is Vite + React in plain JS/JSX, with JSDoc types in `src/types/`. The viewer follows that convention (see §11).
- Vercel Hobby caps the site at 12 serverless functions (`api/_lib/functionCount.test.js`). This design adds none.

## 3. Architecture

```
pipeline/input/<slug>/track.gpx ─┐
pipeline/input/<slug>/photos/*  ─┼─► flyover pipeline (Python, offline, once per hike)
pipeline/hikes/<slug>.toml      ─┘        │ clean track · place photos · fetch 3DEP + NAIP · tile · upload
                                          ▼
                    Cloudflare R2:  tiles/v1/dem/{z}/{x}/{y}.webp
                                    tiles/v1/img/{naipYear}/{z}/{x}/{y}.webp
                                    hikes/<slug>/manifest.json
                                    hikes/<slug>/photos/<hash>.webp
                                          │ streamed on demand (CORS GET)
/hiking ── "Fly it" ──► /hiking/:slug ── lazy chunk: src/flyover/ (three.js viewer + overlays)
```

Three units, each testable alone:
1. **Pipeline (`pipeline/`)**: Python. Input: a GPX, original photos, and a small config. Output: a manifest and tiles on R2.
2. **Viewer engine (`src/flyover/engine/`)**: plain JS and three.js, with no React inside. Input: a canvas, a manifest, and a tile base URL. Output: rendering, plus a small imperative API (`play`, `pause`, `seek`, `setSpeed`, `setTopo`, `on(event)`).
3. **Page and overlays (`src/flyover/`)**: React. Loads the manifest, mounts the engine, and draws the profile, stats, photos, and controls from engine events.

The manifest is the contract between units 1 and 2/3. It's defined as a Pydantic model in the pipeline and a Zod schema in the viewer, with a contract test between them (§10).

## 4. Data sources

| Need | Source | Access | Notes |
|---|---|---|---|
| Elevation | USGS 3DEP | National Map elevation service (`3DEPElevation/ImageServer/exportImage`) | Returns best available data for any box: 1 m lidar where flown, otherwise 1/3 arc-second (~10 m). Public domain. Requested in chunks, since the service caps image size per request. |
| Imagery | NAIP (USDA) | Microsoft Planetary Computer STAC, `naip` collection, cloud-optimized GeoTIFFs signed with the `planetary-computer` package | ~0.6 m in recent cycles. Public domain. Built-in overviews let the pipeline read the horizon ring at low resolution without downloading full-resolution scenes. |
| Imagery fallback | USGS NAIP ImageServer (`USGSNAIPImagery/ImageServer/exportImage`) | Plain HTTP | Latest year only, no year control. Used only if Planetary Computer is unavailable. |
| Time zone | `timezonefinder` (offline) | Python package | Fallback when a photo lacks an EXIF time-zone offset. |
| Sun position | `suncalc` | npm, in the browser | Computed live from the manifest's timestamps and coordinates. |

Attribution ("Elevation: USGS 3DEP · Imagery: USDA NAIP") shows in the viewer's corner. Neither source requires it, but it's good practice.

## 5. Pipeline (`pipeline/`)

**Tooling:** Python 3.12, uv, ruff, black, pytest, type hints throughout, Pydantic v2. CLI via Typer: `uv run flyover build <slug>`, `uv run flyover upload <slug>`, `uv run flyover build-all`. rasterio's Windows wheels bundle GDAL, so `uv sync` needs no separate geospatial install.

**Inputs**
- `pipeline/hikes/<slug>.toml` (committed): display name, `data.js` hike name to link, optional time-zone override, optional `trim_start_m` / `trim_end_m` for privacy, optional NAIP year override, optional per-photo captions, optional shot tuning (§7.3).
- `pipeline/input/<slug>/track.gpx` and `pipeline/input/<slug>/photos/*` (gitignored). Raw tracks and full-size originals stay out of git, and the published manifest holds only the cleaned track.
- `pipeline/.env` (gitignored): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Read from the environment and never logged or printed. `pipeline/.env.example` lists the names with placeholders.

**Stages** (each a module with one job; each stage's output is cached in `pipeline/.cache/<slug>/`, gitignored, so re-runs are cheap)

1. **`track`**: parse GPX 1.1 (gpxpy).
   - **Clean:** drop points with duplicate timestamps, and drop GPS jumps (any point implying more than 4 m/s from its neighbor, sustained for fewer than 3 points). Apply the privacy trims.
   - **Smooth:** smooth the horizontal path with a Savitzky–Golay filter (window about 15 points, polynomial order 2), then resample to one point every 5 m of distance, interpolating time.
   - **Elevations:** replace them by sampling the 1 m 3DEP DEM (bilinear), because GPS altitude is too noisy to use.
   - **Stops:** any stretch slower than 0.3 m/s for at least 60 s.
   - **Stats:** total distance; elevation gain (summing rises over 3 m, to ignore noise); moving time; total time; summit (highest point); average ascent rate. Stats are stored in meters and seconds, and the viewer converts to feet and miles to match `data.js`.
2. **`photos`**: for each original photo, read `DateTimeOriginal` and `OffsetTimeOriginal` (Pillow EXIF). If there's no offset, use the hike's time zone from `timezonefinder` at the trailhead.
   - **Place:** convert the time to UTC and interpolate a track position.
   - **Drop:** photos outside the track's time window, logging a warning with the filename.
   - **Save:** resize to at most 1600 px on the long edge, save as WebP (quality 82), and name it by content hash.
3. **`coverage`**: decide which tiles exist. All tiles are standard 256 px web-map (XYZ, EPSG:3857) tiles.

   | Zoom | Ground resolution at 39°N | Covered area |
   |---|---|---|
   | 8–12 | 470–29 m/px | Circle of radius 40 km around the track's bounding-box center (the horizon ring) |
   | 13–16 | 15–1.8 m/px | Within 8 km of the track |
   | 17 (elevation and imagery) | 0.92 m/px | Within 1 km of the track |
   | 18 (imagery only) | 0.46 m/px | Within 500 m of the track |

   The result goes in the manifest as run-length rows per zoom, `[y, xStart, xEnd]`, so the viewer never requests a tile that doesn't exist.
4. **`dem`**: fetch 3DEP in EPSG:3857 chunks at zoom-17 resolution for the corridor and at ring resolution for the ring. Build lower zooms by downsampling (averaging) higher ones wherever they exist.
   - **Encoding:** heights use terrain-RGB (`h = -10000 + (R·65536 + G·256 + B) · 0.1`) saved as lossless WebP.
   - **Size:** each tile is 258×258: 256 px plus a 1 px border copied from its neighbors, so lighting normals are seamless across tile edges.
   - **Sharing:** tiles are written under `tiles/v1/dem/`. They're keyed by location, so hikes that share an area share tiles, and existing tiles are skipped.
5. **`imagery`**: query the Planetary Computer STAC for NAIP items covering the corridor and pick the newest year that covers the whole corridor, unless the config overrides it. Then mosaic that year's scenes, reproject to EPSG:3857, and cut 256 px tiles.
   - **Ring:** the ring reads the scenes' built-in overviews.
   - **Encoding:** WebP, quality 80.
   - **Location:** `tiles/v1/img/<year>/`.
   - **Seams:** a single year per hike avoids color jumps between scenes. Remaining brightness differences between scenes are left as they are in v1.
6. **`manifest`**: assemble and validate the Pydantic model (§6) and write `manifest.json`.
7. **`upload`**: push to R2 over its S3-compatible API with boto3, skipping objects that already exist.
   - **Caching:** tiles and hashed photos get `Cache-Control: public, max-age=31536000, immutable`. The manifest gets `public, max-age=300`, so edits propagate within minutes.
   - **Content types:** set explicitly (`image/webp`, `application/json`).
   - **Versioning:** any change to tile encoding bumps the `v1` prefix instead of overwriting.

**Size budget:** an estimated 40–80 MB stored per hike, mostly zoom 17/18 near the trail. The pipeline prints per-zoom file counts and bytes at the end of every build. If a hike is over 80 MB, the corridor radii in `coverage` are the tuning knobs.

**One-time R2 setup** (documented in `pipeline/README.md`):
- Create the bucket.
- Add a CORS rule allowing `GET` and `HEAD` from the site's production origin and `http://localhost:5173`. WebGL textures need CORS.
- Choose the serving domain (see §12, open item 1).

## 6. Manifest (version 1)

```jsonc
{
  "version": 1,
  "slug": "quandary",
  "name": "Quandary Peak",
  "startTime": "2026-07-12T11:02:14Z",   // UTC, first point after trimming
  "timezone": "America/Denver",
  "origin": { "lat": 39.3895, "lon": -106.0612 },  // local coordinate origin = trailhead
  "tiles": {
    "version": "v1",
    "naipYear": 2023,
    "demZooms": [8, 17],
    "imgZooms": [8, 18],
    "coverage": { "8": [[97, 52, 53]], "17": [[49903, 26890, 26915], ...] }  // per zoom: [y, xStart, xEnd]
  },
  "track": {          // columnar, one entry per 5 m
    "t":    [0, 3.1, ...],        // seconds since startTime
    "lat":  [...], "lon": [...],
    "ele":  [...],                // meters, from 3DEP
    "dist": [...],                // meters, cumulative
    "moving": [1, 1, 0, ...]      // 0 inside a detected stop
  },
  "stops":  [{ "startIdx": 412, "endIdx": 418, "seconds": 540 }],
  "summit": { "idx": 1105, "lat": 39.3972, "lon": -106.1065, "ele": 4348.0 },
  "stats":  { "distanceM": 10783, "gainM": 1030, "movingS": 12900, "totalS": 16150, "ascentRateMPerH": 482 },
  "photos": [{ "src": "photos/3f9a1c.webp", "t": 6021, "idx": 640, "w": 1600, "h": 1200, "caption": null }],
  "attribution": "Elevation: USGS 3DEP · Imagery: USDA NAIP"
}
```

The viewer builds tile URLs as `${VITE_FLYOVER_BASE_URL}/tiles/{version}/dem/{z}/{x}/{y}.webp` and `.../img/{naipYear}/{z}/{x}/{y}.webp`. Photo URLs are relative to the manifest's folder.

## 7. Viewer engine (`src/flyover/engine/`)

Plain three.js on WebGL2, without react-three-fiber, because tile management and the camera run every frame and are clearer as imperative code. New dependencies: `three`, `suncalc`, and a post-processing package (`postprocessing`). `@takram/three-atmosphere` is evaluated in milestone 4 (§7.2).

### 7.1 Terrain

- **Coordinates.** World space is meters in a local frame centered on `manifest.origin` (east = +x, up = +y, north = −z). Tile corners are converted from Web Mercator to these local meters. Staying near the origin avoids float32 jitter.
- **Earth curvature.** The vertex shader lowers each vertex by `d² / 2R` (with d its horizontal distance from the camera and R = 6,371 km), so the 40 km ring drops about 125 m and the skyline sits right.
- **Tile selection.** A quadtree over the covered tiles. Each frame, starting at zoom 8, a tile splits into its children if they exist in the coverage list and its screen-space error is above a threshold. Screen-space error is the tile's ground resolution projected to screen pixels at its nearest point; the threshold is 1.5 px on desktop and 2.5 px on phones. Tiles outside the view are skipped. A parent stays visible until all four children are loaded, so there are never holes. The on-screen cap is 150 tiles; past it, the threshold is raised for that frame.
- **Geometry.** One shared 65×65 grid, plus a skirt hanging 50 m down on each edge to hide cracks where tiles of different zoom meet. The vertex shader raises each vertex by the decoded height texture.
  - **Zoom 18:** imagery tiles have no zoom-18 elevation, so they sample their zoom-17 parent's height tile with a UV scale and offset.
  - **Normals:** computed per pixel in the fragment shader from neighboring height texels, so ridges stay crisp between vertices.
- **Loading.** A fetch queue with at most 8 requests in flight, ordered by screen-space error (most-needed first).
  - **Decoding:** images decode with `createImageBitmap`. A web worker also decodes height tiles into `Float32Array`s kept for CPU height lookups (used by terrain avoidance, §7.3).
  - **Memory:** textures are capped at 512 MB on desktop and 128 MB on phones, with least-recently-used tiles freed first. Tiles currently on screen are never freed.
  - **Failures:** a failed tile retries twice (after 0.5 s, then 2 s) and then stays on its parent.

### 7.2 Light, atmosphere, finish

- **Sun.** `suncalc` gives the sun's position for the current playback moment (`startTime` + track time) at the origin. Exposure follows the sun's elevation, with a floor so pre-dawn starts stay watchable: blue hour brightens as the hike goes on.
- **Imagery shading.** NAIP already contains shadows from when it was photographed, so full real-time lighting would shade everything twice. Instead, `albedo = mix(imagery, luminance-flattened imagery, 0.2)` and `lit = albedo · mix(1.0, lambert(sunDir, normal) · k, 0.35)`, where `k` normalizes to midday brightness. The 0.2 and 0.35 are tunables exposed in `?debug`.
- **Sky and haze.** `@takram/three-atmosphere` (physically based sky with haze that builds with distance) is evaluated first in milestone 4. It's adopted if it runs within budget (§9) on the target laptop and fits the local-meters frame. Otherwise: three.js's built-in `Sky` plus custom exponential height fog tinted by the sky color near the sun.
- **Post-processing.** AgX tone mapping, a subtle warm grade toward the site's palette (strength tunable, 0 = off), a slight vignette, and bloom limited to the hiker beacon (off on phones).
- **Trail.** A ribbon mesh along the resampled track, lifted 1.5 m and a constant 3 px wide on screen. The walked part is amber `#E8C089` and the rest is bone `#EDE7DA` at 35% opacity.
- **Hiker.** An amber beacon (small emissive sphere plus soft glow sprite) with a pulsing ring on the ground.
- **Topo mode.** The terrain shader switches output to smooth contour lines: every 20 m (every 100 m major, brighter), bone on warm black `#0B0A0A`, antialiased using how fast height changes per pixel. Imagery tiles aren't needed in this mode, so the loader skips them. Toggled with the T key or the header toggle.

### 7.3 Playback and camera

- **Track path.** A centripetal Catmull-Rom curve through the resampled points, parameterized by distance so movement along it is even. Heading is the tangent averaged over a 150 m window, so switchbacks don't swing the camera.
- **Story clock.** Maps playback time to track time, with default durations that are tunable per hike in the TOML:
  - **Moving:** moving sections are compressed at a constant rate.
  - **Stops:** each stop collapses to 1 s.
  - **Summit:** 10 s, during the summit orbit.
  - **Photos:** each photo point gets 2.5 s.

  The compression rate is chosen so the whole flyover lasts 150 s at 1×. Speeds are 0.5×, 1×, 2×, and 4×. The on-screen clock shows real time of day from `startTime` + track time.
- **Springs.** Camera position and aim point each follow their target through a critically damped spring (stiffness tunable). It's integrated in closed form, so it behaves identically at any frame rate. Low-frequency noise adds 1–2 m of hover drift (disabled for reduced motion).
- **Shots.** A data-driven list keyed to track events, where each shot defines a target camera pose relative to the hiker:
  1. **Opening:** high and wide over the whole route, about 1.5× the route's extent up. It descends into the chase over 5 s.
  2. **Ascent chase:** 120 m behind along the heading, 60 m up, 20° off to one side, aimed 40 m ahead of the hiker.
  3. **Summit orbit:** a slow 180° orbit (18°/s) at a 250 m radius, 80 m up, over the 10 s summit pause.
  4. **Descent lead:** the camera 100 m ahead of the hiker, looking back at them.
  5. **Closing:** pull up and away to the opening framing.

  Shots change by moving the springs' target. There are no hard cuts.
- **Terrain avoidance.** Each frame, using the CPU height copies, the rig samples the height below the camera and at 8 points along the line from the camera to the hiker. If the camera is below 30 m above the ground, or the line of sight is blocked, the target height rises until it's clear, smoothed through the springs. If a needed height tile hasn't loaded, its loaded parent is used.
- **Taking over.** A small state machine: `drone → manual → returning → drone`.
  - **drone → manual:** pointer drag, wheel, or pinch. The camera orbits a point that travels with the hiker, and playback keeps running.
    - **Zoom:** limited to 20 m–5 km.
    - **Ground limit:** the camera can't go below 10 m above the ground.
  - **manual → returning:** 3 s with no input, or the Recenter button.
  - **returning → drone:** over 1.5 s the camera eases (ease-in-out) from its manual pose to the rig's pose, then the springs take over again.
- **Keyboard.** Space: play/pause. ←/→: seek ±5% of playback. 1–4: speed. T: topo. Esc: back to `/hiking`. Every control is also a focusable button with an ARIA label.
- **Reduced motion** (`prefers-reduced-motion`): the flyover starts paused on the opening shot, with drift off and 0.5× as the default speed.

### 7.4 Engine API and events

```js
const viewer = createViewer({ canvas, manifest, baseUrl, tier });
viewer.play(); viewer.pause(); viewer.seek(fraction); viewer.setSpeed(2); viewer.setTopo(true); viewer.recenter();
viewer.on('progress', ({ fraction, trackIdx, clockTime }) => {});   // every frame, throttled to about 30 Hz
viewer.on('photo', ({ photo, screen: { x, y } | null }) => {});      // active photo plus its projected screen point
viewer.on('mode', (mode) => {});                                     // 'drone' | 'manual' | 'returning'
viewer.on('loading', ({ loaded, needed }) => {});                     // tiles for the current view
viewer.on('error', (err) => {});
viewer.dispose();
```

## 8. Page and overlays (`src/flyover/`)

- **Route.** Add `/hiking/:slug` to `App.jsx`, lazy-loaded with `React.lazy` and `Suspense`, so three.js ships only in the flyover chunk.
- **Page (`FlyoverPage.jsx`).** Fetches `hikes/<slug>/manifest.json` from `VITE_FLYOVER_BASE_URL` and validates it with Zod (`manifest.js`). Then it checks for WebGL2, picks the quality tier (§9), and mounts the engine. It renders the overlays inside an `.asc` root so the Ascent tokens apply.
- **Overlays.** Each is its own component with DOM elements over the canvas:
  - **`FlyoverHeader`** (top-left): "03 / Hiking / \<name\>" and a back link, matching `SubShell`.
  - **`ClockBadge`** (top-right): real time of day and date, plus the Topo toggle.
  - **`ElevationProfile`** (bottom, full width):
    - **Drawing:** an SVG line colored by climbing rate (amber for fast, bone for slow), with photo ticks.
    - **Playhead:** a playhead synced to the `progress` event.
    - **Seeking:** dragging or clicking seeks the flyover. Hovering shows elevation (ft) and clock time.
    - **Keyboard:** reachable as a slider (`role="slider"`).
  - **`Transport`** (bottom-left): play/pause and speed.
  - **`StatsPanel`** (right edge): distance, gain, moving and total time, summit elevation, and ascent rate, in imperial units.
  - **`PhotoCard`**:
    - **Appearing:** slides in during a photo pause.
    - **Leader line:** a thin line from the card to the photo's projected ground point, which follows it as the camera moves and hides when the point is off screen.
    - **Full size:** click opens the full-size photo in a lightbox.
  - **`LoadingVeil`**: an animated contour placeholder plus "Streaming terrain · n/m". Playback starts once 90% of the opening shot's tiles have loaded, or after 6 s regardless.
  - **`Attribution`**: a small line in the bottom-right corner.
- **Wiring into `/hiking`.**
  - **Data:** add `flyover: '<slug>'` to each hike in `src/ascent/data.js` that has a build.
  - **Button:** `AscentHiking` shows a "Fly it" button in the detail panel only for those hikes.
- **Config.** Add `VITE_FLYOVER_BASE_URL` to `.env.example`. It's a public URL, not a secret, but it varies by environment.

## 9. Failures, performance, phones

**Failure handling**

| Situation | Behavior |
|---|---|
| WebGL2 unavailable or context creation fails | Show the hike's photos, profile, and stats, with "3D flyover needs WebGL2" |
| WebGL context lost | Pause, wait for restore, rebuild GPU resources, reload visible tiles, resume |
| Tile request fails | Two retries (0.5 s, 2 s), then stay on the parent. Playback never waits on a tile |
| Manifest missing (404) or fails Zod | "Flyover not found" page inside the site layout, linking to `/hiking` (validation details only in the console) |
| Unknown slug | Same as a missing manifest |

**Performance targets**
- **Frame rate:** 60 fps at 1080p on laptop integrated graphics (Apple M-series or Intel Iris Xe class) during a 1× drone playback.
- **Limits:** at most 150 tiles on screen, 8 downloads at once, and 512 MB of textures.
- **Height decoding:** done off the main thread in a web worker.
- **Frame-rate guard:** if the average drops below 45 fps for 3 s, first lower the render resolution (in steps down to 1.0×), then raise the tile-detail threshold by 0.5 px per step. It never goes back up during a session.

**Quality tiers.** Chosen once at start from the WebGL renderer string, `navigator.deviceMemory`, screen size, and whether the device is touch-first. The phone tier has:
- render resolution at most 1.5×
- imagery capped at zoom 17
- the ring cut to 15 km
- no bloom
- a 128 MB texture cap
- a 2.5 px tile-detail threshold

**Debug.** `?debug` shows the frame rate, tile count, texture memory, the tile-border overlay, the current shot, the camera mode, and sliders for the shading tunables.

## 10. Testing

**Pipeline (pytest; ruff and black clean)**
- **Track:** GPX cleaning on test tracks with deliberate jumps, duplicate timestamps, and a known stop; resampling spacing; stats against a hand-checked short track.
- **Photos:** EXIF time with and without an offset, the time-zone fallback, and dropping photos outside the track window.
- **Tile math:** latitude/longitude to tile and back, the corridor coverage rows, and the run-length encoding round trip.
- **Height encoding:** the terrain-RGB encode/decode round trip is within 0.05 m, and borders match neighboring tiles.
- **Manifest:** Pydantic validation of a full test manifest.
- **Network:** 3DEP, STAC, and R2 clients sit behind small interfaces, and tests use recorded fixtures, so tests never touch the network.

**Viewer (vitest, pure modules only)**
- **Tile math:** tile ↔ local meters and the curvature offset.
- **Tile selection:** screen-space error, split decisions, parent kept until children load, and the 150-tile cap.
- **Height decoding:** matches the pipeline's encoding.
- **Story clock:** stop and photo pauses, a total of 150 s, and seeking.
- **Springs:** the same result for the same total time whether stepped at 30, 60, or 144 fps.
- **Terrain avoidance:** on a synthetic landscape with a ridge between camera and hiker.
- **Take-over state machine:** every transition, including input arriving during `returning`.
- **Contract test:** the Zod schema must accept `pipeline/tests/fixtures/manifest.sample.json`, which the Python test suite regenerates from the Pydantic model, and must reject known-bad variants.

**Visual verification**
- **Screenshots:** in the preview browser at each milestone for the opening shot, mid-ascent chase, summit orbit, and topo mode.
- **Frame rate:** read from `?debug` on the target laptop.

## 11. Conventions for this feature

- **Pipeline:** Python per the user's global defaults (Pydantic v2, type hints, pytest, ruff, black).
- **Viewer:** plain JS/JSX with JSDoc types, matching the existing codebase (`src/types/*.js` style), rather than introducing TypeScript for one feature. Confirmed by the user in spec review.
- **Styling:** overlays use the existing Ascent tokens and classes from `src/ascent/ascent.css`. New CSS goes in `src/flyover/flyover.css`, scoped under `.asc`.
- **Tests:** co-located (`foo.test.js` next to `foo.js`).

## 12. Milestones

Each milestone ends with something visible.

1. **Pipeline.** `uv run flyover build quandary && uv run flyover upload quandary` puts Quandary's manifest and tiles on R2. Imagery and height tiles look right in an ordinary web-map viewer (e.g. a throwaway MapLibre page), and the build prints its size report. Nothing on the site changes.
2. **Terrain.** `/hiking/quandary` shows sharp-near, coarse-far satellite terrain out to the 40 km horizon, with curvature, a free orbit camera, and the trail ribbon, at 60 fps on the target laptop. **This is the realism checkpoint.** If NAIP on lidar doesn't look good enough, stop and revisit §2 before continuing.
3. **Flight.** Story clock, hiker beacon, drone shots, terrain avoidance, taking over and handing back, and the keyboard controls.
4. **Atmosphere and polish.** Real sun, sky and haze (the takram evaluation happens here), color grade, topo mode, the synced profile, photo cards, stats, the loading veil, and the fallbacks.
5. **Rollout.** Build every tracked hike, add "Fly it" on `/hiking`, the phone tier, the frame-rate guard, and a final performance pass.

## 13. Risks and open items

1. **Serving domain for R2.** A custom domain on R2 requires the domain's DNS to be managed by Cloudflare. If the site's domain is on other DNS, the options are:
   - move DNS to Cloudflare, or
   - use a separate domain or subdomain whose DNS is on Cloudflare, or
   - use the `r2.dev` URL, which is rate-limited and meant for development only.

   Decide before milestone 1's upload step.
2. **Realism ceiling.** NAIP is shot straight down in summer, so vertical faces stretch and seasonal snow won't match the hike. Accepted for v1, and milestone 2 checks whether it's good enough.
3. **Download size.** A full desktop playback may stream a large share of the corridor tiles, tens of MB. Measured in milestone 2; the corridor radii and the zoom-18 radius are the knobs.
4. **Planetary Computer availability.** Planetary Computer's services have changed before. The USGS NAIP ImageServer fallback keeps the pipeline working, but without year control.
5. **`@takram/three-atmosphere` fit.** It may assume a different coordinate frame or cost more than the budget allows. The fallback is defined in §7.2.
6. **Photo timestamps.** Camera clocks can be wrong, and the pipeline can't detect that. The TOML accepts a per-hike photo time offset (`photo_time_offset_s`) to fix a skewed clock by hand.
