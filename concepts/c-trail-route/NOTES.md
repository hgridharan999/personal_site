# C: Trail Route

**Concept.** The page is a route you walk: the hiker is the trailhead, and one dashed line runs from their feet down the margin, passing a ring at each section label and a filled tan ▲ at 01 · NOW ("you are here").

**Type.** Geist 400/500 body, Geist 800 uppercase GRIDHARAN, Geist Mono for labels and years, Instrument Serif italic only for "Hari". One grotesk plus one mono reads like a map legend.

**Signature.** The hiker pen-strokes in (~1.2s), then the trail inks downward. After that, `animation-timeline: scroll()` inks the route as you scroll, using background-coloured covers over a static dashed line so dashes stay crisp. With no support, no JS or reduced motion, the route is fully drawn. On mobile the line stays in the 16px gutter (9px rings, 4px clear of text), so nothing is dropped.

**Trades away.** Markers hang in the margin. The elevation strip adds about 50px of header height. "Seeking…" wraps to two balanced lines at 390px.

**Real build.** `<Trail/>` and `<Waypoint/>` components with Tailwind arbitrary values for the margin math and a small CSS file for the `@supports` scroll timelines. The hiker becomes a client component measuring its paths in `useLayoutEffect`.
