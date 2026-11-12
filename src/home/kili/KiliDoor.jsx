import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ARM_MS, doorTap } from './door';

// The door's three lines in a 48 by 48 box, about 15 wide and 25 tall. The box's bottom edge is
// the foot: labels.js stands it on the front plains line. The jambs start at the foot, so they
// draw upward; the lintel is a shallow arch from jamb to jamb. The half-pixel x keeps the jambs
// crisp (labels.js puts the box on a whole pixel).
const JAMB_L = 'M16.5 48V25';
const JAMB_R = 'M31.5 48V25';
const LINTEL = 'M16.5 25Q24 21 31.5 25';

/**
 * A hidden way in to /nightly: nothing at rest, and on hover a small doorway lifts out of the
 * drawing's front line. A click opens it. On touch the first tap lifts it and a second tap
 * within a few seconds opens it; a tap anywhere else, or the wait running out, settles it back.
 *
 * Deliberately no link, focus stop, role or name: it lives inside the band, which is
 * aria-hidden, and it is only found by someone who knows where to look.
 */
export default function KiliDoor() {
  const ref = useRef(null);
  const pressedRef = useRef(false); // the current press began on the door
  const navigate = useNavigate();
  const [armedAt, setArmedAt] = useState(null);

  // While armed: show the door drawn, and settle it on a tap elsewhere or when the wait runs out.
  // `open` is toggled by hand, never through className: labels.js owns the `on` class, and a
  // className React recomputed would wipe it out (and with it the door's pointer events).
  useEffect(() => {
    const el = ref.current;
    if (armedAt === null || !el) return undefined;
    const disarm = () => setArmedAt(null);
    const onDown = (e) => {
      if (!el.contains(e.target)) disarm();
    };
    el.classList.add('open');
    const timer = setTimeout(disarm, ARM_MS);
    document.addEventListener('pointerdown', onDown);
    return () => {
      el.classList.remove('open');
      clearTimeout(timer);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [armedAt]);

  const onPointerDown = () => {
    pressedRef.current = true;
  };
  const onPointerLeave = () => {
    pressedRef.current = false;
  };
  const onPointerUp = (e) => {
    const pressed = pressedRef.current;
    pressedRef.current = false;
    if (!pressed) return; // pressed somewhere else and released over the door
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const next = doorTap({ armedAt }, { pointerType: e.pointerType, now: e.timeStamp });
    setArmedAt(next.state.armedAt);
    if (next.open) navigate('/nightly');
  };

  return (
    <div ref={ref} className="kili-door" data-kili="door" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerLeave={onPointerLeave}>
      <svg viewBox="0 0 48 48" width="48" height="48">
        <path className="kili-door-l" pathLength="1" stroke="currentColor" d={JAMB_L} />
        <path className="kili-door-l" pathLength="1" stroke="currentColor" d={JAMB_R} />
        <path className="kili-door-l" pathLength="1" stroke="currentColor" d={LINTEL} />
      </svg>
    </div>
  );
}
