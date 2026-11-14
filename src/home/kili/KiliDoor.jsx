import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ARM_MS, doorTap } from './door';

/**
 * A hidden way in to /nightly. This is only its hit area, an invisible 48 px box over the bottom
 * left of the drawing (labels.js puts it there, and gives it the pointer once the drawing is up).
 * The door itself is the drawing's front line: while it is open, the canvas lifts a small doorway
 * out of that line (draw.js, told by a 'kili:door' event on the band).
 *
 * A mouse or pen hovering opens it, and a click goes through. On touch the first tap opens it and
 * a second tap within a few seconds goes through; a tap anywhere else, or the wait running out,
 * lets it back down.
 *
 * Deliberately no link, focus stop, role or name: it lives inside the band, which is
 * aria-hidden, and it is only found by someone who knows where to look.
 */
export default function KiliDoor() {
  const ref = useRef(null);
  const bandRef = useRef(null); // the band the drawing listens on, kept for the unmount
  const pressedRef = useRef(false); // the current press began on the door
  const hoverRef = useRef(false); // a mouse or pen is over the door
  const armedRef = useRef(false); // a first tap has opened it
  const openRef = useRef(false); // what the drawing was last told
  const navigate = useNavigate();
  const [armedAt, setArmedAt] = useState(null);

  /** Tell the drawing whether the door should be open, when that changes. */
  const sync = () => {
    const open = hoverRef.current || armedRef.current;
    if (open === openRef.current) return;
    openRef.current = open;
    bandRef.current?.dispatchEvent(new CustomEvent('kili:door', { detail: { open } }));
  };

  // Find the band once; leaving the page with the door open lets it down.
  useEffect(() => {
    bandRef.current = ref.current?.closest('.kili-band') ?? null;
    return () => {
      hoverRef.current = false;
      armedRef.current = false;
      sync();
    };
  }, []);

  // While armed: hold the door open, and let it down on a tap elsewhere or when the wait runs out.
  useEffect(() => {
    const el = ref.current;
    if (armedAt === null || !el) return undefined;
    const disarm = () => setArmedAt(null);
    const onDown = (e) => {
      if (!el.contains(e.target)) disarm();
    };
    armedRef.current = true;
    sync();
    const timer = setTimeout(disarm, ARM_MS);
    document.addEventListener('pointerdown', onDown);
    return () => {
      armedRef.current = false;
      sync();
      clearTimeout(timer);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [armedAt]);

  // A touch has no hover: its enter and leave come with the tap itself, so they open nothing.
  const onPointerEnter = (e) => {
    if (e.pointerType === 'touch') return;
    hoverRef.current = true;
    sync();
  };
  const onPointerDown = () => {
    pressedRef.current = true;
  };
  const onPointerLeave = () => {
    pressedRef.current = false;
    hoverRef.current = false;
    sync();
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
    <div ref={ref} className="kili-door" data-kili="door" onPointerEnter={onPointerEnter} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerLeave={onPointerLeave} />
  );
}
