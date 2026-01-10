import { motion } from 'framer-motion';

// Wobbly underline that animates in
export const WobblyUnderline = ({ delay = 0 }) => (
  <motion.svg
    className="absolute -bottom-2 left-0 w-full"
    viewBox="0 0 300 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay }}
  >
    <motion.path
      d="M5 8Q30 3 60 6T120 8Q150 10 180 7T240 8Q270 9 295 7"
      stroke="#C67B5C"
      strokeWidth="2.5"
      strokeLinecap="round"
      fill="none"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{
        duration: 1.5,
        delay: delay + 0.3,
        ease: "easeOut"
      }}
    />
  </motion.svg>
);

// Small coffee cup doodle
export const CoffeeDoodle = ({ delay = 0, className = "" }) => (
  <motion.svg
    className={className}
    width="32"
    height="32"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay, duration: 0.8, ease: "backOut" }}
  >
    <motion.path
      d="M8 12h12M7 12c0-1 .5-2 2-2h10c1.5 0 2 1 2 2v8c0 2-1 3-3 3h-8c-2 0-3-1-3-3v-8z"
      stroke="#6B7A5C"
      strokeWidth="1.5"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 1, delay: delay + 0.2, ease: "easeOut" }}
    />
    <motion.path
      d="M21 14h2c1 0 2 .5 2 2s-1 2-2 2h-2"
      stroke="#6B7A5C"
      strokeWidth="1.5"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.6, delay: delay + 0.5, ease: "easeOut" }}
    />
    <motion.path
      d="M12 6c0-1 .5-2 1-2M16 6c0-1 .5-2 1-2"
      stroke="#6B7A5C"
      strokeWidth="1.5"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.4, delay: delay + 0.8, ease: "easeOut" }}
    />
  </motion.svg>
);

// Mountain outline doodle
export const MountainDoodle = ({ delay = 0, className = "" }) => (
  <motion.svg
    className={className}
    width="40"
    height="32"
    viewBox="0 0 40 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay, duration: 0.8, ease: "backOut" }}
  >
    <motion.path
      d="M2 28L12 12L18 20L28 8L38 28"
      stroke="#6B7A5C"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 1.2, delay: delay + 0.2, ease: "easeOut" }}
    />
  </motion.svg>
);

// Hand-drawn arrow
export const HandDrawnArrow = ({ direction = "right", className = "" }) => {
  const paths = {
    right: "M4 12h20m-6-6l6 6-6 6",
    down: "M12 4v20m-6-6l6 6 6-6",
  };

  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={paths[direction]}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// Checkmark sketch
export const SketchCheckmark = ({ delay = 0, className = "" }) => (
  <motion.svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay }}
  >
    <motion.path
      d="M4 10l4 4L16 6"
      stroke="#6B7A5C"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.4, delay: delay + 0.1, ease: "easeOut" }}
    />
  </motion.svg>
);

// Star doodle
export const StarDoodle = ({ delay = 0, className = "" }) => (
  <motion.svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    initial={{ opacity: 0, rotate: -20 }}
    animate={{ opacity: 1, rotate: 0 }}
    transition={{ delay, duration: 0.5, ease: "backOut" }}
  >
    <motion.path
      d="M8 2l1.5 4.5h4.5l-3.5 2.5 1.5 4.5L8 11l-3.5 2.5 1.5-4.5-3.5-2.5h4.5L8 2z"
      stroke="#C67B5C"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.8, delay: delay + 0.1, ease: "easeOut" }}
    />
  </motion.svg>
);

// Hand-drawn border frame
export const HandDrawnBorder = ({ children, className = "", delay = 0 }) => (
  <div className={`relative ${className}`}>
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 300 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <motion.path
        d="M5 5Q4 5 4 6L4 194Q4 195 5 195L295 195Q296 195 296 194L296 6Q296 5 295 5L5 5"
        stroke="#D4CFC4"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, delay, ease: "easeOut" }}
      />
    </svg>
    {children}
  </div>
);

// Dashed divider line
export const DashedDivider = ({ className = "" }) => (
  <svg
    className={className}
    width="100%"
    height="4"
    viewBox="0 0 400 4"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="none"
  >
    <path
      d="M0 2h400"
      stroke="#D4CFC4"
      strokeWidth="2"
      strokeDasharray="8 6"
      strokeLinecap="round"
    />
  </svg>
);

// Bracket decoration
export const BracketDecoration = ({ side = "left", className = "" }) => {
  const path = side === "left"
    ? "M12 2C6 2 2 6 2 12s4 10 10 10"
    : "M2 2c6 0 10 4 10 10s-4 10-10 10";

  return (
    <svg
      className={className}
      width="16"
      height="24"
      viewBox="0 0 16 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={path}
        stroke="#6B7A5C"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
};

// Tree doodle for hiking entries
export const TreeDoodle = ({ className = "" }) => (
  <svg
    className={className}
    width="20"
    height="24"
    viewBox="0 0 20 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10 2l-4 6h2l-3 6h3v8M10 2l4 6h-2l3 6h-3"
      stroke="#6B7A5C"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Elevation icon (mountain peak)
export const ElevationIcon = ({ className = "" }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2 16l5-8 4 4 5-10 2 4v10H2zM10 6l1-2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Distance icon (trail path)
export const DistanceIcon = ({ className = "" }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2 10h4m2 0h4m2 0h4M6 10c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zM12 10c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

// Compass icon for timeline
export const CompassIcon = ({ className = "" }) => (
  <svg
    className={className}
    width="28"
    height="28"
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="2" />
    <path d="M14 3v3M14 22v3M3 14h3M22 14h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M10 10l6 2-2 6-6-2z" fill="currentColor" opacity="0.3" />
  </svg>
);

// Tent icon for timeline
export const TentIcon = ({ className = "" }) => (
  <svg
    className={className}
    width="28"
    height="28"
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M4 22L14 6l10 16M14 6v16M9 14h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Backpack icon for timeline
export const BackpackIcon = ({ className = "" }) => (
  <svg
    className={className}
    width="28"
    height="28"
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M7 10h14v12H7zM10 6h8v4M7 14h14M10 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="10" cy="6" r="1.5" fill="currentColor" />
    <circle cx="18" cy="6" r="1.5" fill="currentColor" />
  </svg>
);

// Boots icon for timeline
export const BootsIcon = ({ className = "" }) => (
  <svg
    className={className}
    width="28"
    height="28"
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M5 16v4h6l2-4V8M19 16v4h6l2-4V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Flag icon for timeline
export const FlagIcon = ({ className = "" }) => (
  <svg
    className={className}
    width="28"
    height="28"
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M6 4v20M6 4h14l-3 5 3 5H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" fillOpacity="0.2" />
  </svg>
);
