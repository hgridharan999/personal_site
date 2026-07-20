import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

/**
 * HikerHeroScene
 * ──────────────
 * Landing background: a single scene image (the hiker on a trail, in the rough
 * white line-art style) made to feel alive by *lighting alone* — several large,
 * very-low-intensity light pools that slowly drift across the screen and pulse
 * at staggered periods, so the scene appears lit from shifting directions.
 * No rain, no boil, no grain — just moving light.
 *
 * Scene image expected at /hiker-scene.jpg (swap this file for a new render;
 * the lighting layer is image-agnostic). Sits at the warm <PanoramaScene/>'s
 * z-layer and paints on top, opaque on "/", fading out on navigation.
 * `mode="whole-site"` shows it on every route (future option 2).
 */

const SCENE_SRC = '/hiker-scene.jpg';

export default function HikerHeroScene({ mode = 'landing', animated = true }) {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const visible = mode === 'whole-site' || isHome;

  return (
    <motion.div
      aria-hidden="true"
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.9, ease: [0.65, 0, 0.2, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: -1,
        overflow: 'hidden', pointerEvents: 'none', backgroundColor: '#000',
      }}
    >
      {/* the scene */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${SCENE_SRC})`,
        backgroundSize: 'cover', backgroundPosition: 'center bottom',
        backgroundRepeat: 'no-repeat',
      }} />

      {/* light from above: a pale sun + lightning flashing through the clouds */}
      {animated && (
        <div className="hero-lights">
          <div className="hero-lite sun" />
          <div className="hero-lite strikeA" />
          <div className="hero-lite strikeB" />
        </div>
      )}

      {/* top-left readability gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(115deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.34) 30%, rgba(0,0,0,0) 55%)',
      }} />
      {/* edge vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(120% 90% at 62% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%)',
      }} />

      <style>{`
        .hero-lights { position: absolute; inset: 0; }
        .hero-lite {
          position: absolute;
          mix-blend-mode: screen; will-change: transform, opacity; opacity: 0;
          pointer-events: none; filter: blur(55px);
        }
        /* pale sun — soft, formless, high above the peak. Two offset ellipses so
           it never reads as a clean disc; long falloff to nothing. */
        .hero-lite.sun {
          width: 60vmax; height: 48vmax; left: 10%; top: -22%;
          background:
            radial-gradient(ellipse 62% 70% at 52% 44%, rgba(244,232,196,0.8), rgba(244,232,196,0) 78%),
            radial-gradient(ellipse 95% 45% at 40% 58%, rgba(244,232,196,0.35), rgba(244,232,196,0) 82%);
          animation: sunDrift 44s ease-in-out infinite, sunPulse 22s ease-in-out infinite;
        }
        /* lightning over the MOUNTAIN (centre-left); reach kept off the hiker so
           he stays a dark foreground silhouette (depth). Irregular + blurred so
           the glow has no visible edge. */
        .hero-lite.strikeA {
          width: 96vmax; height: 86vmax; left: -18%; top: -12%;
          background:
            radial-gradient(ellipse 66% 58% at 46% 42%, rgba(208,224,255,0.85), rgba(208,224,255,0) 80%),
            radial-gradient(ellipse 52% 78% at 60% 56%, rgba(208,224,255,0.45), rgba(208,224,255,0) 84%);
          animation: strikeA 8.5s steps(1, end) infinite;
        }
        .hero-lite.strikeB {
          width: 72vmax; height: 68vmax; left: 2%; top: -18%;
          background:
            radial-gradient(ellipse 60% 64% at 50% 46%, rgba(200,218,255,0.85), rgba(200,218,255,0) 80%),
            radial-gradient(ellipse 84% 46% at 40% 58%, rgba(200,218,255,0.4), rgba(200,218,255,0) 84%);
          animation: strikeB 11s steps(1, end) infinite;
        }

        /* sun: gentle drift + pale pulse (kept faint against the photo) */
        @keyframes sunDrift {
          0%,100% { transform: translate(-3vw, 0) scale(1); }
          50%     { transform: translate(3vw, 2vh) scale(1.05); }
        }
        @keyframes sunPulse { 0%,100% { opacity: 0.11; } 50% { opacity: 0.20; } }

        /* lightning: dark most of the time, brief double-strike bursts */
        @keyframes strikeA {
          0%, 6%, 100% { opacity: 0; }
          2%  { opacity: 0.6; }
          4%  { opacity: 0.12; }
          5%  { opacity: 0.48; }
          58% { opacity: 0; }
          59% { opacity: 0.5; }
          61% { opacity: 0.08; }
          62% { opacity: 0.4; }
          64% { opacity: 0; }
        }
        @keyframes strikeB {
          0%, 100% { opacity: 0; }
          33% { opacity: 0; }
          34% { opacity: 0.52; }
          36% { opacity: 0.1; }
          37% { opacity: 0.42; }
          39% { opacity: 0; }
          82% { opacity: 0; }
          83% { opacity: 0.38; }
          85% { opacity: 0; }
        }
      `}</style>
    </motion.div>
  );
}
