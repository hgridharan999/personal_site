# D · Summit Register

**Concept.** The ruled logbook at the top of a peak, rebuilt for a 30-second recruiter scan: every role is one ledger entry, and the leading numbers sit in a tan figures column the eye can run straight down.

**Type.** Hanken Grotesk (400/500/600, plus 800 for the surname) is sturdy and neutral, so the page survives a squint. DM Mono carries years, counts and labels, since tabular mono makes the year column and register headers read as ledger columns. Instrument Serif italic appears only in the tan "Hari".

**Signature moment.** The 1.2s hiker pen-stroke on load. On desktop hover, a ▲ lights in the gutter, the hairline brightens and the company turns tan, like a finger tracking a register line.

**Trades away.** Air and drama. Rows without a number (Loadstone, Armada, Widget Factory, LLM Cost Optimizer, TrailSense) leave an empty figures cell until the TK metrics land. On phones, long one-liners wrap deeper.

**React/Tailwind.** A typed entries array feeds `<RegisterSection>` and `<LedgerRow>`. Tokens go into `theme.extend.colors`. The figures column is `grid-cols-[4.5rem_1fr] md:grid-cols-[4.75rem_1fr]`. Contours become `<Contour variant>`, the mark a `<HikerMark>` with a reduced-motion guard. Both stay inline SVG for prerender.
