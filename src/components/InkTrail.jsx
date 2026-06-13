import { useEffect, useRef } from 'react';

/**
 * InkTrail — velocity-aware ink blobs that feel like a wet pen on paper.
 *
 * Physics:
 *  - Slow movement  → big fat pools (10-22px), near-round, high opacity
 *  - Fast movement  → small elongated streaks (4-8px), lower opacity
 *  - Occasional satellite splatter dots near each main blob
 *  - Shapes are organically irregular via randomised border-radius
 *  - Fade duration scales with blob size (bigger ink pools linger longer)
 */
export default function InkTrail() {
  const lastPos  = useRef({ x: 0, y: 0 });
  const lastTime = useRef(performance.now());
  const velocity = useRef(0); // smoothed speed in px/ms

  useEffect(() => {
    const onMouseMove = (e) => {
      const now = performance.now();
      const dt  = Math.max(now - lastTime.current, 1);

      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Don't spawn if barely moved
      if (dist < 4) return;

      const rawSpeed = dist / dt; // px/ms
      // Smooth velocity with EMA
      velocity.current = velocity.current * 0.6 + rawSpeed * 0.4;
      const spd = velocity.current;

      lastPos.current  = { x: e.clientX, y: e.clientY };
      lastTime.current = now;

      // ── Size: inverse of speed, clamped ──
      // slow (spd < 0.1)  → big   (14–22px)
      // fast (spd > 0.8)  → small (4–7px)
      const speedNorm = Math.min(spd / 0.8, 1);
      const baseSize  = 22 - speedNorm * 18 + Math.random() * 4; // 4–26px range

      // ── Elongation: fast = stretch in movement direction ──
      const angle   = Math.atan2(dy, dx) * (180 / Math.PI);
      const stretch = 1 + speedNorm * 1.4; // 1x → 2.4x stretch at full speed
      const w = baseSize * stretch;
      const h = baseSize / Math.max(stretch * 0.7, 1);

      // ── Opacity: slow = dark pool, fast = light flick ──
      const opacity = 0.55 - speedNorm * 0.3;

      // ── Irregular border-radius (organic blob shape) ──
      const br = () => Math.floor(30 + Math.random() * 40);
      const borderRadius = `${br()}% ${br()}% ${br()}% ${br()}% / ${br()}% ${br()}% ${br()}% ${br()}%`;

      spawnBlob(e.clientX, e.clientY, w, h, angle, opacity, borderRadius);

      // ── Satellite splatter — more likely when slow/pooling ──
      const splatterChance = 0.15 + (1 - speedNorm) * 0.35;
      if (Math.random() < splatterChance) {
        const count = Math.ceil(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          const sr  = 2 + Math.random() * 5;
          const ang = Math.random() * Math.PI * 2;
          const rad = baseSize * (0.6 + Math.random() * 1.2);
          const sx  = e.clientX + Math.cos(ang) * rad;
          const sy  = e.clientY + Math.sin(ang) * rad;
          const sbr = () => Math.floor(30 + Math.random() * 40);
          spawnBlob(sx, sy, sr, sr * (0.6 + Math.random() * 0.8), Math.random() * 360, opacity * 0.6,
            `${sbr()}% ${sbr()}% ${sbr()}% ${sbr()}% / ${sbr()}% ${sbr()}% ${sbr()}% ${sbr()}%`);
        }
      }
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  return null;
}

function spawnBlob(cx, cy, w, h, angleDeg, opacity, borderRadius) {
  const el = document.createElement('div');

  // Size — slightly randomise so no two blobs are identical
  const fw = w * (0.85 + Math.random() * 0.3);
  const fh = h * (0.85 + Math.random() * 0.3);

  // Fade duration — bigger blobs linger
  const fadeDuration = 600 + (fw / 22) * 900; // 600ms–1500ms

  Object.assign(el.style, {
    position:     'fixed',
    width:        `${fw}px`,
    height:       `${fh}px`,
    left:         `${cx}px`,
    top:          `${cy}px`,
    transform:    `translate(-50%, -50%) rotate(${angleDeg}deg)`,
    borderRadius,
    background:   '#2C2C2C',
    opacity:      String(opacity),
    pointerEvents:'none',
    zIndex:       '9999',
    animation:    `inkBlobFade ${fadeDuration}ms ease-out forwards`,
  });

  // Inject keyframe if not already present
  if (!document.getElementById('ink-blob-style')) {
    const style = document.createElement('style');
    style.id = 'ink-blob-style';
    style.textContent = `
      @keyframes inkBlobFade {
        0%   { opacity: var(--ink-op, 0.5); transform: translate(-50%,-50%) rotate(var(--ink-r,0deg)) scale(1); }
        40%  { opacity: var(--ink-op, 0.5); }
        100% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--ink-r,0deg)) scale(0.6); }
      }
    `;
    document.head.appendChild(style);
  }

  // Pass opacity + rotation as CSS vars so keyframe can reference them
  el.style.setProperty('--ink-op', String(opacity));
  el.style.setProperty('--ink-r', `${angleDeg}deg`);

  document.body.appendChild(el);
  setTimeout(() => el.remove(), fadeDuration + 50);
}
