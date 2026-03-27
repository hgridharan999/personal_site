import { useState, useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';

export default function AxolotlIcon({ size = 44, isOpen = false, isThinking = false }) {
  const [blinkVisible, setBlinkVisible] = useState(false);
  const controls = useAnimation();

  // Random blinking overlay effect
  useEffect(() => {
    let blinkTimeout, closeTimeout;
    function scheduleBlink() {
      blinkTimeout = setTimeout(() => {
        setBlinkVisible(true);
        closeTimeout = setTimeout(() => {
          setBlinkVisible(false);
          scheduleBlink();
        }, 120);
      }, 3000 + Math.random() * 2500);
    }
    scheduleBlink();
    return () => { clearTimeout(blinkTimeout); clearTimeout(closeTimeout); };
  }, []);

  // Thinking: gentle side-to-side head tilt
  useEffect(() => {
    if (isThinking) {
      controls.start({
        rotate: [-3, 3, -3],
        transition: { repeat: Infinity, duration: 0.7, ease: 'easeInOut' },
      });
    } else {
      controls.start({ rotate: 0, transition: { duration: 0.3 } });
    }
  }, [isThinking, controls]);

  return (
    <div
      style={{ width: size, height: size, position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Idle gentle float */}
      <motion.div
        animate={isOpen || isThinking ? {} : {
          y: [0, -2, 0],
        }}
        transition={{
          repeat: Infinity,
          duration: 2.8,
          ease: 'easeInOut',
        }}
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
        {/* Head tilt when thinking */}
        <motion.div
          animate={controls}
          style={{ width: '100%', height: '100%', transformOrigin: 'center bottom' }}
        >
          <img
            src="/gizmo.png"
            alt="Gizmo the goat"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              // Slightly squint when thinking
              filter: isThinking ? 'brightness(0.95) saturate(0.9)' : 'none',
              transition: 'filter 0.3s ease',
            }}
            draggable={false}
          />

          {/* Blink overlay — two white bars that cover the eyes */}
          {blinkVisible && (
            <div
              style={{
                position: 'absolute',
                top: '34%',
                left: '20%',
                right: '20%',
                height: '8%',
                background: '#F5F3EE',
                borderRadius: '50%',
                pointerEvents: 'none',
              }}
            />
          )}
        </motion.div>
      </motion.div>

      {/* Thinking dots — appear above the icon */}
      {isThinking && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: -2,
            display: 'flex',
            gap: 2,
          }}
        >
          {[0, 0.2, 0.4].map((delay, i) => (
            <motion.span
              key={i}
              style={{ width: 3, height: 3, borderRadius: '50%', background: '#C67B5C', display: 'block' }}
              animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 0.7, delay, ease: 'easeInOut' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
