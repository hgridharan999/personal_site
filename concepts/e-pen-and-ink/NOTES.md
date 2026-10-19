# e-pen-and-ink

**Concept.** Everything decorative is drawn by the hand that drew the hiker: contour dividers, the row ▲, link underlines and the Resume/Email borders are all wobbly pen strokes, while the type stays crisp and corporate.

**Type.** Bricolage Grotesque (optical sizing on; 400/500 body, 800 caps name) is warm and slightly odd but still reads serious. Fragment Mono carries metadata and labels. Instrument Serif italic appears only as tan "Hari".

**Signature.** The 13-stroke hiker draws in over 1.2s, each stroke timed by its length with the pen easing. As the last stroke lands, the first contour divider inks in left to right over about 500ms. It plays once. Reduced motion or no JS shows everything fully drawn.

**Trades away.** Ornaments are small and faint (dividers at 8%), so it is warmer than a neutral recruiter page but less graphic. Underline draw-in and the ▲ are desktop-only. On phones the "Seeking…" line wraps.

**React/Tailwind.** Generate the seeded paths once and ship them as `<Hiker/>`, `<Contour/>`, `<InkUnderline/>` and `<SketchBox/>` components. Tokens go in `tailwind.config`. The draw-in becomes a small client hook around `getTotalLength()`. Everything else stays CSS, so the page prerenders.
