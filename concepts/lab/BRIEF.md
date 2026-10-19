# Animation lab brief: bottom-of-page sketches

Hari's site is now the light "glacier" direction: `concepts/o-glacier/index.html` (served at http://localhost:5180/o-glacier/). White page `#FFFFFF`, black ink `#111111`, muted `#5C5C5C`, iceberg blue `#0F7DAA` (deeper `#0B6A93`), DM Mono for small labels, Hanken Grotesk for text. It's a "trail log": Hari hikes Colorado fourteeners (most recent Quandary Peak, 14,265 ft). Each sketch is a candidate for the very bottom of that page (above or behind the footer), so it must never cost content space above the fold and must feel crafted, not like a tech demo.

## Output contract (every sketch)

- One self-contained file: `concepts/lab/<slug>.html`. Inline CSS/JS. No libraries, no build step. External requests: Google Fonts only. Shared assets you may use (relative paths from `concepts/lab/`):
  - `../_shared/hiker.png`: Hari's hiker line art (294 × 480, cream lines on transparent; draw it black via canvas compositing or CSS `filter: brightness(0)`).
  - `../_shared/mountain-plate.png`: the sketched mountain (1280 × 482, cream lines on transparent).
  - `../_shared/quandary-terrain.json`: real Quandary elevation (grid 112, `heights[row][col]` in metres, row 0 = north, `contours`, `track` [[x, y, ele]…] of his GPS route, `summit`).
- The file shows the sketch as it would sit at the bottom of the page: a full-width band about 280–360px tall on desktop (cap the drawing area at ~1100px wide, centered) and ~240px on a 390px phone, followed by a mock footer line in DM Mono 12px uppercase: `CONTOUR INTERVAL 1 YEAR · LAST UPDATED OCT 2026`. Put a tiny caption above the band (12px DM Mono, muted) naming the sketch, so Hari can tell them apart. Nothing else on the page.
- Crafted: custom easing, no default `linear` motion unless it's physical, DPR-aware canvases (cap DPR at 2), crisp lines, restraint with color (ink + one iceberg blue, unless the concept itself is color).
- Responsive: works at 390, 768 and 1440 wide; no horizontal scroll; pointer AND touch (touch = tap/drag equivalents).
- Performance and manners: pause the loop when the band is offscreen (IntersectionObserver) and when `document.hidden`; under `prefers-reduced-motion: reduce`, render one beautiful still frame and no animation. Aim for 60fps on a laptop; no frame should take more than ~6ms of JS.
- Accessibility: the canvas/SVG is decorative (`aria-hidden="true"`); the footer text is real text.
- Write the file early (a working first version within ~20 minutes), then refine. Don't spend more than ~50 minutes per sketch.

## Verifying

Screenshot with headless Chrome: `"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=4000 --window-size=1440,500 --screenshot=<png> http://localhost:5180/lab/<slug>.html`. Headless Chrome may not advance requestAnimationFrame reliably, so also check the reduced-motion still with `--force-prefers-reduced-motion`, and if you need mid-animation frames, drive real time over the DevTools protocol or step your simulation manually in a debug mode. Headless Chrome on Windows has a ~500px minimum window width: to check 390px, put a temporary same-origin page with a 390px-wide iframe in `concepts/lab/` and delete it afterwards. Read every PNG you make. Launch headless Chrome with its own `--user-data-dir` in the scratchpad and, if it hangs, stop only that process by PID; never `taskkill /IM chrome.exe` or anything that closes Chrome by name (it closes the owner's own browser). Never read `.env*` files. No git commands. Write only your own `concepts/lab/<slug>.html` files (and temporary test files you delete).
