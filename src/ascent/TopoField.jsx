import { useEffect, useRef } from 'react';

/**
 * TopoField
 * ─────────
 * A living topographic contour field drawn on canvas — stacked ridgelines
 * perturbed by layered-sine fbm, denser/brighter toward the foreground. It
 * drifts slowly and rises with scroll, so the whole page reads as an ascent
 * through terrain. Faint bone lines on warm black.
 */

// cheap fractal noise from summed sines — organic, no dependencies
function fbm(x, phase) {
  let v = 0, a = 0.5, f = 1;
  for (let o = 0; o < 4; o++) {
    v += a * Math.sin(x * f + phase * (1 + o * 0.5) + o * 1.7);
    f *= 2.02; a *= 0.5;
  }
  return v; // ~[-1,1]
}

export default function TopoField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W, H, raf, t = 0, scrollY = 0;
    const LINES = 46;

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const onScroll = () => { scrollY = window.scrollY || window.pageYOffset || 0; };

    const draw = () => {
      t += reduced ? 0 : 0.0016;
      ctx.clearRect(0, 0, W, H);
      const rise = scrollY * 0.16;           // terrain climbs as you scroll
      const step = Math.max(6, W / 180);

      for (let i = 0; i < LINES; i++) {
        const f = i / (LINES - 1);           // 0 top → 1 bottom
        const baseY = H * 0.16 + f * H * 1.02 - rise * (0.4 + f * 0.9);
        if (baseY < -80 || baseY > H + 120) continue;
        const amp = 5 + f * f * 74;          // bigger ridges in the foreground
        const freq = 0.0016 + f * 0.0016;
        const phase = t * (0.5 + f) + i * 0.55;
        const alpha = 0.04 + f * 0.14;

        ctx.beginPath();
        for (let x = -step; x <= W + step; x += step) {
          const y = baseY - amp * (0.5 + 0.5 * fbm(x * freq + i * 0.3, phase));
          x === -step ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(237,231,218,${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', onScroll, { passive: true });
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
