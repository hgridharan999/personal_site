import { motion } from 'framer-motion';

export default function AxolotlIcon({ size = 40, isOpen = false, isThinking = false }) {
  const gillDuration = isThinking ? 0.6 : isOpen ? 1.2 : 2.5;
  const gillDegrees = isThinking ? 14 : isOpen ? 10 : 6;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Body */}
      <ellipse cx="20" cy="31" rx="10" ry="7" fill="#F5DDD0" stroke="#2C2C2C" strokeWidth="1.5" />

      {/* Front legs */}
      <ellipse cx="12" cy="36" rx="3.5" ry="2" fill="#F5DDD0" stroke="#2C2C2C" strokeWidth="1.5" />
      <ellipse cx="28" cy="36" rx="3.5" ry="2" fill="#F5DDD0" stroke="#2C2C2C" strokeWidth="1.5" />

      {/* Head */}
      <circle cx="20" cy="18" r="9" fill="#F5DDD0" stroke="#2C2C2C" strokeWidth="1.5" />

      {/* Left gill group — anchor at (11, 18), paths in local coords */}
      <g transform="translate(11, 18)">
        <motion.g
          animate={{ rotate: [-gillDegrees, gillDegrees, -gillDegrees] }}
          transition={{ repeat: Infinity, duration: gillDuration, ease: 'easeInOut' }}
        >
          <path d="M0 -4 Q-5 -9 -3 -15" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
          <path d="M0 0 Q-7 -4 -7 -9" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
          <path d="M0 4 Q-6 2 -7 -3" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
        </motion.g>
      </g>

      {/* Right gill group — anchor at (29, 18), paths in local coords */}
      <g transform="translate(29, 18)">
        <motion.g
          animate={{ rotate: [gillDegrees, -gillDegrees, gillDegrees] }}
          transition={{ repeat: Infinity, duration: gillDuration, ease: 'easeInOut' }}
        >
          <path d="M0 -4 Q5 -9 3 -15" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
          <path d="M0 0 Q7 -4 7 -9" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
          <path d="M0 4 Q6 2 7 -3" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
        </motion.g>
      </g>

      {/* Eyes */}
      <circle cx="17" cy="17" r="1.5" fill="#2C2C2C" />
      <circle cx="23" cy="17" r="1.5" fill="#2C2C2C" />

      {/* Smile */}
      <path d="M17 21 Q20 23.5 23 21" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
