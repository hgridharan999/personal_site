import { useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

/**
 * PanoramaScene
 * ─────────────
 * A single solid, full-opacity panorama image that acts as a "world map".
 * Each route points a virtual camera at a different region of the same image
 * (Work = peak, Projects = valley, Hiking = forest trail, Theses = lake), and
 * the camera animates between regions on navigation.
 *
 * The camera translate is CLAMPED so the scaled image always fully covers the
 * viewport — a zoom can never reveal empty background. Ambient life (clouds,
 * mist, lake shimmer, cabin smoke) lives inside the camera in image-% so it
 * zooms with the landscape.
 *
 * Image expected at /panorama.png (falls back until it lands). Regions are
 * focal points in [0..1] over the image + a zoom scale — easy to re-calibrate.
 */

const PANORAMA_SRC = '/panorama.png';
const FALLBACK_SRC = '/mountain-bg-clean.png';

const REGIONS = {
  '/':          { fx: 0.50, fy: 0.50, scale: 1.0 }, // establishing shot
  '/work':      { fx: 0.80, fy: 0.23, scale: 2.9 }, // the summit (right)
  '/projects':  { fx: 0.59, fy: 0.72, scale: 2.9 }, // valley, river & cabins
  '/climbing':  { fx: 0.32, fy: 0.70, scale: 3.1 }, // switchback trail
  '/blog':      { fx: 0.14, fy: 0.75, scale: 3.7 }, // alpine lake (far left)
  '/trailsense':{ fx: 0.59, fy: 0.72, scale: 2.9 },
  '/climate-search': { fx: 0.59, fy: 0.72, scale: 2.9 },
};

const DEFAULT_REGION = { fx: 0.55, fy: 0.55, scale: 2.6 };

function regionFor(pathname) {
  if (REGIONS[pathname]) return REGIONS[pathname];
  if (pathname.startsWith('/blog')) return REGIONS['/blog'];
  return DEFAULT_REGION;
}

// Translate (in % of viewport) to bring the focal point to screen center,
// CLAMPED so the scaled image edges never enter the viewport. At scale 1 the
// image covers exactly, so the max translate on each axis is (scale/2 - 0.5).
function cameraTransform({ fx, fy, scale }) {
  const limit = Math.max(0, scale / 2 - 0.5);
  const clamp = (v) => Math.max(-limit, Math.min(limit, v));
  const tx = clamp(-scale * (fx - 0.5));
  const ty = clamp(-scale * (fy - 0.5));
  return { scale, x: `${tx * 100}%`, y: `${ty * 100}%` };
}

function getTimeTint() {
  const h = new Date().getHours();
  if (h >= 19 || h < 6) return 'rgba(30, 42, 66, 0.20)';   // night — cool
  if (h >= 6 && h < 8)  return 'rgba(198, 123, 92, 0.10)'; // dawn — warm
  if (h >= 18 && h < 19)return 'rgba(198, 123, 92, 0.12)'; // dusk — warm
  return 'rgba(0, 0, 0, 0)';                                // day — neutral
}

export default function PanoramaScene() {
  const location = useLocation();
  const cam = cameraTransform(regionFor(location.pathname));

  const [src, setSrc] = useState(PANORAMA_SRC);
  const [tint] = useState(getTimeTint);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, zIndex: -1,
        overflow: 'hidden', pointerEvents: 'none', backgroundColor: '#F3ECDD',
      }}
    >
      {/* static overscale wrapper (tiny bleed for rounding safety) */}
      <div style={{ position: 'absolute', inset: '-2%' }}>
        {/* camera — image + ambient life zoom together */}
        <motion.div
          initial={false}
          animate={cam}
          transition={{ duration: 1.15, ease: [0.65, 0, 0.2, 1] }}
          style={{ position: 'absolute', inset: 0, transformOrigin: 'center center', willChange: 'transform' }}
        >
          <img
            src={src}
            onError={() => src !== FALLBACK_SRC && setSrc(FALLBACK_SRC)}
            alt=""
            draggable={false}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center center', display: 'block',
            }}
          />

          {/* ── Ambient life, positioned over the image in image-% ── */}
          <div className="amb cloud" style={{ left: '20%', top: '8%',  width: '18vw', height: '5vw' }} />
          <div className="amb cloud c2" style={{ left: '4%',  top: '20%', width: '12vw', height: '3.5vw' }} />
          <div className="amb cloud c3" style={{ left: '60%', top: '4%',  width: '14vw', height: '4vw' }} />
          <div className="amb cloud c4" style={{ left: '78%', top: '14%', width: '10vw', height: '3vw' }} />
          <div className="amb mist" style={{ left: '40%', top: '56%', width: '34vw', height: '9vw' }} />
          <div className="amb shimmer" style={{ left: '1%', top: '70%', width: '20vw', height: '6vw' }} />
          <div className="amb smoke" style={{ left: '61.5%', top: '76%' }} />
          <div className="amb smoke s2" style={{ left: '63%', top: '77%' }} />
        </motion.div>
      </div>

      {/* time-of-day tint */}
      <div style={{ position: 'absolute', inset: 0, background: tint, mixBlendMode: 'multiply' }} />

      {/* whisper-thin readability wash, keyed left where homepage text sits */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background:
            'linear-gradient(105deg, rgba(245,241,232,0.78) 0%, rgba(245,241,232,0.34) 26%, rgba(245,241,232,0) 50%)',
        }}
      />

      <style>{`
        .amb { position: absolute; pointer-events: none; will-change: transform, opacity; }
        .cloud {
          background: radial-gradient(closest-side, rgba(255,252,245,0.85), rgba(255,252,245,0) 72%);
          border-radius: 50%; filter: blur(2px); opacity: 0.6;
          animation: ambDriftR 60s linear infinite;
        }
        .cloud.c2 { opacity: 0.45; animation: ambDriftR 82s linear infinite; animation-delay: -20s; }
        .cloud.c3 { opacity: 0.5;  animation: ambDriftR 70s linear infinite; animation-delay: -35s; }
        .cloud.c4 { opacity: 0.4;  animation: ambDriftL 90s linear infinite; }
        .mist {
          background: radial-gradient(closest-side, rgba(228,224,210,0.5), rgba(228,224,210,0) 75%);
          filter: blur(6px); opacity: 0.45; animation: ambMist 34s ease-in-out infinite;
        }
        .shimmer {
          background: linear-gradient(0deg, rgba(255,250,240,0), rgba(255,250,240,0.5) 50%, rgba(255,250,240,0));
          filter: blur(3px); opacity: 0.3; animation: ambShimmer 9s ease-in-out infinite;
        }
        .smoke {
          width: 0.5vw; height: 6vw;
          background: linear-gradient(0deg, rgba(230,225,215,0.55), rgba(230,225,215,0) 85%);
          filter: blur(3px); border-radius: 40%; transform-origin: bottom center;
          animation: ambSmoke 11s ease-in-out infinite;
        }
        .smoke.s2 { height: 5vw; opacity: 0.7; animation: ambSmoke 13s ease-in-out infinite; animation-delay: -4s; }
        @keyframes ambDriftR { from { transform: translateX(-6vw); } to { transform: translateX(10vw); } }
        @keyframes ambDriftL { from { transform: translateX(8vw); }  to { transform: translateX(-8vw); } }
        @keyframes ambMist { 0%,100% { transform: translateX(-3vw); opacity: 0.35; } 50% { transform: translateX(3vw); opacity: 0.55; } }
        @keyframes ambShimmer { 0%,100% { opacity: 0.16; transform: scaleX(0.98); } 50% { opacity: 0.4; transform: scaleX(1.02); } }
        @keyframes ambSmoke { 0% { transform: translateY(0) scaleY(0.9); opacity: 0; } 20% { opacity: 0.6; } 100% { transform: translateY(-3vw) scaleY(1.3); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .amb { animation: none !important; }
          .shimmer, .smoke { opacity: 0.25; }
        }
      `}</style>
    </div>
  );
}
