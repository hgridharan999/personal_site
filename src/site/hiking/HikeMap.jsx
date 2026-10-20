import { useMemo } from 'react';

import { layoutMap, VB_H, VB_W } from './mapGeometry';

/**
 * One numbered pin. A <g> with role="button" because an SVG child cannot be a real <button>; Enter
 * and Space are wired by hand to match. A pin whose state is closed stays in the DOM, so it can
 * shrink and fade in place, but leaves the tab order and the accessibility tree.
 * Position and scale live in a style transform, not the attribute, so CSS transitions can move them.
 */
function Pin({ pin, active, visible, onSelect }) {
  const number = pin.i + 1;
  const r = active ? 28 : 22;
  const choose = () => onSelect(pin.i);
  const onKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault(); // Space would otherwise scroll the page
    choose();
  };
  return (
    <g
      className="sp-pin"
      role="button"
      tabIndex={visible ? 0 : -1}
      aria-hidden={visible ? undefined : true}
      aria-pressed={active}
      aria-label={`${number}. ${pin.name}`}
      style={{ transform: `translate(${pin.x.toFixed(1)}px, ${pin.y.toFixed(1)}px) scale(calc(var(--pk, 1) * ${visible ? 1 : 0.2}))` }}
      onClick={choose}
      onKeyDown={onKeyDown}
    >
      <circle className="sp-pin-ring" r={r + 7} />
      <circle className="sp-pin-dot" r={r} />
      <text textAnchor="middle" dominantBaseline="central">{number}</text>
    </g>
  );
}

/**
 * A light locator map: three state outlines and a numbered pin per hike in an open state. The
 * list beside it does the same job, so the map is a second way in, not the only one.
 */
export default function HikeMap({ hikes, active, visible, onSelect }) {
  const { paths, labels, pins } = useMemo(() => layoutMap(hikes), [hikes]);
  return (
    <div className="sp-map-box">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="group" aria-label="Hike locations" className="sp-map">
        {paths.map(({ key, d }) => <path key={key} d={d} className="sp-state-shape" aria-hidden="true" />)}
        {labels.map(({ key, text, x, y }) => (
          <text key={key} x={x} y={y} textAnchor="middle" className="sp-map-label">{text}</text>
        ))}
        {pins.map((pin) => (
          <Pin key={pin.i} pin={pin} active={pin.i === active} visible={visible.has(pin.i)} onSelect={onSelect} />
        ))}
      </svg>
      <p className="sp-status">Pins show the open states.</p>
    </div>
  );
}
