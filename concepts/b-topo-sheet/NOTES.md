# b-topo-sheet

**Concept:** the profile is printed like a USGS 7.5′ quadrangle: all the cartography lives in the collar and the contour dividers, while the 640px column stays plain and scannable.

**Type:** IBM Plex Sans carries the body and the heavy uppercase name; IBM Plex Mono is strictly metadata (years, labels, coordinates, chips); Instrument Serif italic appears only in “Hari”. Sans and Mono share skeletons, so the survey-form feel comes from one family, and the serif is a single warm tan exception.

**Signature moment:** the hiker, drawn at a uniform 1.6px like a map symbol, pen-strokes onto a tan ridge line in 1.2s. Runner-up: the hover ▲ is a benchmark marker (triangle with a centre dot).

**Trades away:** no row rules or imagery, so the page leans on type and whitespace. The frame, ticks and coordinates are desktop-only. Contours at 7–10% opacity are texture, not information.

**React/Tailwind translation:** tokens go in `tailwind.config`. `Collar` and `Divider` become server components. The contour master is one shared `<symbol>` with per-section x offsets. `Row` takes title, company, year and note props, with the hover marker as a `group-hover` pseudo-element. `HikerMark` is a small client component for the draw-in.
