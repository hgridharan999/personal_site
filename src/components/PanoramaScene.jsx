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
          <div className="amb cloud"    style={{ left: '14%', top: '9%',  width: '20vw', height: '5.5vw' }} />
          <div className="amb cloud c2" style={{ left: '2%',  top: '22%', width: '13vw', height: '3.6vw' }} />
          <div className="amb cloud c3" style={{ left: '54%', top: '5%',  width: '15vw', height: '4vw' }} />

          {/* a flock of birds crossing the sky */}
          <div className="amb birds" style={{ top: '16%' }}>
            <svg viewBox="0 0 90 34" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 16 Q10 8 16 16 Q22 8 28 16"   stroke="#3b3a36" strokeWidth="2"   strokeLinecap="round" />
              <path d="M40 10 Q45 4 50 10 Q55 4 60 10"  stroke="#3b3a36" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M58 24 Q62 19 66 24 Q70 19 74 24" stroke="#3b3a36" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>

          {/* valley mist */}
          <div className="amb mist" style={{ left: '38%', top: '55%', width: '36vw', height: '10vw' }} />
          {/* lake shimmer */}
          <div className="amb shimmer" style={{ left: '1%', top: '70%', width: '20vw', height: '6vw' }} />
          {/* cabin smoke */}
          <div className="amb smoke" style={{ left: '61.5%', top: '74%' }} />
          <div className="amb smoke s2" style={{ left: '63%', top: '75%' }} />
          {/* warm glow breathing on the peak */}
          <div className="amb glow" style={{ left: '70%', top: '10%', width: '24vw', height: '24vw' }} />
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
        /* Ambient background motion is the centerpiece of the design — it runs
           with !important so it survives the global reduced-motion override. */
        .amb { position: absolute; pointer-events: none; will-change: transform, opacity; }
        .cloud {
          background: radial-gradient(closest-side, rgba(255,253,247,0.95), rgba(255,253,247,0) 70%);
          border-radius: 50%; filter: blur(3px); opacity: 0.85;
          animation: cloudDrift 30s ease-in-out infinite !important;
        }
        .cloud.c2 { opacity: 0.7; animation: cloudDrift 38s ease-in-out infinite !important; animation-delay: -12s; }
        .cloud.c3 { opacity: 0.75; animation: cloudDrift 34s ease-in-out infinite !important; animation-delay: -6s; }
        .birds { left: -14vw; opacity: 0.55; animation: birdsFly 22s linear infinite !important; }
        .birds svg { width: 7vw; height: auto; display: block; }
        .mist {
          background: radial-gradient(closest-side, rgba(230,226,214,0.6), rgba(230,226,214,0) 74%);
          filter: blur(7px); opacity: 0.5; animation: ambMist 20s ease-in-out infinite !important;
        }
        .shimmer {
          background: linear-gradient(0deg, rgba(255,250,240,0), rgba(255,250,240,0.6) 50%, rgba(255,250,240,0));
          filter: blur(3px); opacity: 0.35; animation: ambShimmer 6s ease-in-out infinite !important;
        }
        .smoke {
          width: 0.6vw; height: 7vw;
          background: linear-gradient(0deg, rgba(235,230,220,0.8), rgba(235,230,220,0) 88%);
          filter: blur(3px); border-radius: 40%; transform-origin: bottom center;
          animation: ambSmoke 8s ease-in-out infinite !important;
        }
        .smoke.s2 { height: 5.5vw; animation: ambSmoke 10s ease-in-out infinite !important; animation-delay: -3s; }
        .glow {
          background: radial-gradient(closest-side, rgba(255,204,150,0.4), rgba(255,204,150,0) 70%);
          mix-blend-mode: screen;
          animation: ambGlow 7s ease-in-out infinite !important;
        }
        @keyframes cloudDrift { 0%,100% { transform: translateX(-5vw); } 50% { transform: translateX(8vw); } }
        @keyframes birdsFly {
          0%   { transform: translate(0, 0); }
          25%  { transform: translate(32vw, -2.5vw); }
          50%  { transform: translate(62vw, 1vw); }
          75%  { transform: translate(92vw, -1.5vw); }
          100% { transform: translate(128vw, 0); }
        }
        @keyframes ambMist { 0%,100% { transform: translateX(-4vw); opacity: 0.4; } 50% { transform: translateX(4vw); opacity: 0.62; } }
        @keyframes ambShimmer { 0%,100% { opacity: 0.2; transform: scaleX(0.98); } 50% { opacity: 0.55; transform: scaleX(1.03); } }
        @keyframes ambSmoke { 0% { transform: translateY(0) scaleY(0.9); opacity: 0; } 25% { opacity: 0.8; } 100% { transform: translateY(-4vw) scaleY(1.4); opacity: 0; } }
        @keyframes ambGlow { 0%,100% { opacity: 0.45; transform: scale(0.95); } 50% { opacity: 0.9; transform: scale(1.1); } }
      `}</style>
    </div>
  );
}
