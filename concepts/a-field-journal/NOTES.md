# A · Field Journal

**Concept.** The PRD executed as written: a quiet, airy page kept like a trail log, built on the live site's fonts and palette so migration is cheap.

**Type.** Archivo carries body text and the heavy GRIDHARAN (800, -0.035em). Instrument Serif italic appears only as tan "Hari". Space Mono is strictly annotation: years, locations, labels, TK chips. Lead numbers in each one-liner go cream against muted copy, so headline figures scan fast.

**Signature.** A ten-stroke hiker draws itself once in 1.2s on the pen curve, staggered in drawing order; the tan pack strap is the lone accent. Fully drawn without JS or under reduced motion. At 390px the mark sits above the lockup: beside a 96px mark GRIDHARAN would shrink to about 30px, while stacked it holds about 41px and shares one left edge with the lines, buttons and rows.

**Trades away.** No hero beyond the mark. Hierarchy rests on weight and tone, and the 8% contours are near-subliminal. "Seeking…" wraps to two lines below about 540px.

**React/Tailwind.** Tokens go into `theme.extend`; components are `Row`, `SectionLabel`, `Contour`, `TkChip`. `HikerMark` runs the draw-in in `useEffect`, drawn by default, so prerender is safe. Hover uses `[@media(hover:hover)_and_(pointer:fine)]:`.
