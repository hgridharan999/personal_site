import { fallbackShapes } from './iceberg.js';

// Built once at module load: the data is deterministic and has no DOM dependency.
const S = fallbackShapes();

/**
 * The still iceberg that paints first (and stays for anyone without WebGL): the same polygon as the
 * shader, as a low-poly SVG over the band's CSS gradient. The band hides it once the canvas has drawn.
 */
export default function BandFallback() {
  const { gradient: g } = S;
  return (
    <svg viewBox="-3 0 6 1" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g.id} gradientUnits="userSpaceOnUse" x1="0" y1={g.y1} x2="0" y2={g.y2}>
          {g.stops.map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </linearGradient>
        <clipPath id={S.clipId}>
          <polygon points={S.hull} />
        </clipPath>
      </defs>
      <polygon points={S.hull} fill={`url(#${g.id})`} fillOpacity="0.9" />
      <g clipPath={`url(#${S.clipId})`}>
        {S.triangles.map((t, i) => (
          <polygon key={i} points={t.points} fill="#fff" fillOpacity={t.opacity} />
        ))}
        {S.chords.map((c, i) => (
          <line key={i} {...c} stroke="#fff" strokeOpacity="0.42" strokeWidth="0.003" />
        ))}
      </g>
      <polygon points={S.hull} fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.004" strokeLinejoin="round" />
      <polygon points={S.tip} fill="#F3FAFD" stroke="#0F7DAA" strokeWidth="0.004" strokeLinejoin="round" />
      {S.tipFacets.map((f, i) => (
        <polygon key={i} points={f.points} fill={f.fill} fillOpacity={f.opacity} />
      ))}
      <line x1="-3" x2="3" y1={S.waterline} y2={S.waterline} stroke="#0F7DAA" strokeWidth="0.004" strokeOpacity="0.8" />
    </svg>
  );
}
