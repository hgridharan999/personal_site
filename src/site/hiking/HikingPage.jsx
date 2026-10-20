import { useCallback, useMemo, useRef, useState } from 'react';

import { HIKES, HIKES_BY_STATE } from '../../ascent/data';
import SiteShell from '../SiteShell';
import HikeDetail from './HikeDetail';
import HikeMap from './HikeMap';
import StateList from './StateList';
import './hiking.css';

// Each state with the flat index of its first hike: the number a row and its map pin share.
const GROUPS = HIKES_BY_STATE.map((group, k) => ({
  ...group,
  start: HIKES_BY_STATE.slice(0, k).reduce((n, g) => n + g.hikes.length, 0),
}));

const INTRO = `${HIKES.length} hikes across Colorado, California and Washington. Open a state, then pick a hike or a pin.`;

// Colorado (the first state) starts open so the map has pins on first paint.
const startOpen = () => ({ [GROUPS[0].state]: true });

// The detail sits above the list on a phone, so a pick can leave it off screen. Scroll only then:
// beside the list on a desktop it is already in view (and sticky), and moving the page would be noise.
function revealDetail(el) {
  if (!el || el.getBoundingClientRect().top >= 0) return;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
}

export default function HikingPage() {
  const [sel, setSel] = useState(0);
  const [photo, setPhoto] = useState(0);
  const [open, setOpen] = useState(startOpen);
  const detailRef = useRef(null);

  // One handler sets both values, so the new hike never renders with the old hike's photo index
  // (an effect would paint that mismatch for a frame).
  const select = useCallback((i) => {
    setSel(i);
    setPhoto(0);
    revealDetail(detailRef.current);
  }, []);

  const toggle = useCallback((state, isOpen) => {
    setOpen((prev) => (Boolean(prev[state]) === isOpen ? prev : { ...prev, [state]: isOpen }));
  }, []);

  const visible = useMemo(
    () => new Set(GROUPS.flatMap((g) => (open[g.state] ? g.hikes.map((_, k) => g.start + k) : []))),
    [open],
  );

  return (
    <SiteShell wide title="Hiking" intro={INTRO}>
      <div className="sp-hk">
        <div className="sp-nav">
          <StateList groups={GROUPS} sel={sel} open={open} onToggle={toggle} onSelect={select} />
          <HikeMap hikes={HIKES} active={sel} visible={visible} onSelect={select} />
        </div>
        <HikeDetail ref={detailRef} hike={HIKES[sel]} index={sel} total={HIKES.length} photo={photo} onPhoto={setPhoto} />
      </div>
    </SiteShell>
  );
}
