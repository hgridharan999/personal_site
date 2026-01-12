import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { ElevationIcon, DistanceIcon, MountainDoodle, CompassIcon, TentIcon, BackpackIcon, BootsIcon, FlagIcon } from '../components/HandDrawnElements';

const hikesData = [
  {
    date: "June 2025",
    name: "Mt. Bierstadt",
    location: "Colorado",
    elevation: "14,065 ft",
    distance: "7.0 mi",
    difficulty: "Moderate",
    photos: ["/bierstadt-1.jpg", "/bierstadt-2.jpg", "/bierstadt-3.jpg"],
    review: "My first fourteener summit. Started at 5 AM under headlamp, watching the sky slowly lighten. The trail is straightforward but relentless - just keeps climbing. Hit the willows section which was muddy and annoying, then broke above treeline. The final push to the summit had me gasping in the thin air. But standing on top at 14,065 feet, looking across at the Sawtooth, I finally got it. This is just the beginning.",
    highlights: ["First 14er summit", "Alpine start", "Above treeline views", "Sawtooth ridge perspective"],
    rotation: 1.5,
    icon: CompassIcon,
  },
  {
    date: "August 2025",
    name: "Sky Pond",
    location: "Rocky Mountain National Park",
    elevation: "10,900 ft",
    distance: "9.0 mi",
    difficulty: "Strenuous",
    photos: ["/skypond-1.jpg", "/skypond-2.jpg", "/skypond-3.jpg", "/skypond-4.jpg"],
    review: "The boulder scramble up to Sky Pond was unlike anything I'd done before - hands and feet finding holds on massive rocks, pulling myself up through narrow gaps. Lake of Glass appeared first, perfectly still and reflecting the cliffs. Then Sky Pond itself, tucked into this dramatic cirque with waterfalls cascading down sheer walls. The water was absolutely freezing but crystal clear. Worth every challenging step.",
    highlights: ["Boulder field scramble", "Lake of Glass", "Waterfall climbs", "Alpine lake swimming"],
    rotation: -1.5,
    icon: TentIcon,
  },
  {
    date: "November 2025",
    name: "Lost Lake",
    location: "Indian Peaks Wilderness",
    elevation: "10,700 ft",
    distance: "8.2 mi",
    difficulty: "Moderate",
    photos: ["/lostlake-1.jpg", "/lostlake-2.jpg", "/lostlake-3.jpg", "/lostlake-4.jpg"],
    review: "Late season hike with fresh snow dusting the peaks. The trail wound through golden aspen groves before climbing into evergreen forest. Lost Lake sits in this perfect basin surrounded by jagged peaks. The reflection was insane - mountains mirrored perfectly in the still water. Hardly saw another soul. Found a rock to sit on and just absorbed the silence. This is why I hike.",
    highlights: ["Fall colors", "Peak reflections", "Solitude", "Fresh snow on peaks"],
    rotation: 2,
    icon: BackpackIcon,
  },
  {
    date: "January 2026",
    name: "Escondido Falls",
    location: "Malibu, California",
    elevation: "400 ft",
    distance: "3.8 mi",
    difficulty: "Easy",
    photos: ["/escondido-1.jpg", "/escondido-2.jpg", "/escondido-3.jpg", "/escondido-4.jpg"],
    review: "Coastal hike with an ocean breeze and the sound of waves in the background. The trail took us through a creek and up to this stunning 150-foot waterfall hidden in a canyon. Winter rains had it flowing strong. Upper falls required a bit of scrambling over slippery rocks, but the payoff was worth it. A perfect California adventure mixing beach vibes with waterfall magic.",
    highlights: ["Coastal trail", "Hidden waterfall", "Creek crossing", "Ocean views"],
    rotation: -1.8,
    icon: BootsIcon,
  },
  {
    date: "January 2026",
    name: "Seven Falls",
    location: "Colorado Springs",
    elevation: "7,200 ft",
    distance: "2.4 mi",
    difficulty: "Easy-Moderate",
    photos: [],
    review: "Winter hike with ice formations everywhere. The seven cascading waterfalls were partially frozen, creating these incredible ice sculptures. Climbed the 224 metal steps alongside the falls - legs were burning by the top. The canyon walls narrow dramatically, and you can hear the water echoing. Short hike but the frozen waterfalls made it special. Perfect winter adventure close to town.",
    highlights: ["224 steps climb", "Frozen waterfalls", "Narrow canyon", "Ice formations"],
    rotation: -2,
    icon: FlagIcon,
  },
];

const ImageGallery = ({ hike, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/80 backdrop-blur-sm p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative bg-white p-8 max-w-4xl w-full max-h-[90vh] overflow-auto shadow-2xl"
        style={{ borderRadius: '8px' }}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-paper rounded-full hover:bg-line transition-colors"
        >
          <X className="w-6 h-6 text-ink" />
        </button>

        {/* Title */}
        <div className="mb-6">
          <h2 className="text-4xl font-handwritten font-bold text-ink mb-2">{hike.name}</h2>
          <p className="text-xl font-handwritten text-ink-accent">{hike.location}</p>
          <div className="flex gap-4 mt-3 text-sm font-body text-fade">
            <span className="flex items-center gap-1">
              <ElevationIcon className="w-4 h-4" /> {hike.elevation}
            </span>
            <span className="flex items-center gap-1">
              <DistanceIcon className="w-4 h-4" /> {hike.distance}
            </span>
            <span>{hike.difficulty}</span>
          </div>
        </div>

        {/* Main image */}
        <div className="aspect-[16/10] bg-gradient-to-br from-line to-paper relative overflow-hidden mb-4">
          {hike.photos.length > 0 ? (
            <img
              src={hike.photos[currentIndex]}
              alt={`${hike.name} - Photo ${currentIndex + 1}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-fade font-handwritten text-2xl">
              Photos coming soon
            </div>
          )}

          {/* Date stamp */}
          <div className="absolute top-3 right-3 bg-paper/95 px-4 py-2 font-handwritten text-base text-fade shadow-tape border border-line">
            {hike.date}
          </div>
        </div>

        {/* Thumbnail grid */}
        {hike.photos.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {hike.photos.map((photo, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`aspect-[4/3] bg-gradient-to-br from-line to-paper transition-all overflow-hidden ${
                currentIndex === index ? 'ring-4 ring-highlight scale-105' : 'hover:scale-105'
              }`}
            >
              <img
                src={photo}
                alt={`${hike.name} thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
        )}

        {/* Review */}
        <blockquote className="font-body text-base text-ink leading-relaxed border-l-4 border-highlight pl-4 italic mb-4">
          "{hike.review}"
        </blockquote>

        {/* Highlights */}
        <div className="flex flex-wrap gap-2">
          {hike.highlights.map((highlight, i) => (
            <span
              key={i}
              className="px-3 py-1.5 bg-ink-accent/10 border border-ink-accent/30 font-notes text-sm text-ink-accent"
              style={{
                borderRadius: i % 2 === 0 ? '12px 10px 14px 8px' : '10px 12px 8px 14px',
              }}
            >
              {highlight}
            </span>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

const TimelineMarker = ({ hike, index, isActive, onClick }) => {
  const Icon = hike.icon;

  return (
    <div className="flex flex-col items-center min-w-[200px]">
      {/* Date above marker */}
      <motion.div
        className="mb-3 font-handwritten text-base text-fade whitespace-nowrap"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.15 }}
      >
        {hike.date}
      </motion.div>

      {/* Marker circle */}
      <motion.button
        onClick={onClick}
        className={`relative w-16 h-16 rounded-full transition-all duration-300 ${
          isActive
            ? 'bg-highlight border-4 border-highlight shadow-lg scale-110'
            : 'bg-paper border-4 border-line hover:border-ink-accent hover:scale-105'
        }`}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          delay: index * 0.15 + 0.2,
          type: "spring",
          stiffness: 200,
          damping: 15
        }}
        whileHover={{ y: -4 }}
      >
        {/* Unique icon for each hike */}
        <Icon
          className={`absolute inset-0 m-auto transition-all duration-300 ${
            isActive ? 'opacity-100' : 'opacity-60'
          }`}
          style={{ color: isActive ? "#F5F1E8" : "#6B7A5C" }}
        />

        {/* Glow effect when active */}
        {isActive && (
          <motion.div
            className="absolute inset-0 rounded-full bg-highlight opacity-30 blur-md"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 0.3 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </motion.button>

      {/* Dotted connector line down */}
      <svg className="mt-3" width="2" height="60" viewBox="0 0 2 60">
        <motion.line
          x1="1"
          y1="0"
          x2="1"
          y2="60"
          stroke="#D4CFC4"
          strokeWidth="2"
          strokeDasharray="4 4"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: index * 0.15 + 0.4, duration: 0.6 }}
        />
      </svg>
    </div>
  );
};

const HikeCard = ({ hike, index, onClick }) => {
  return (
    <motion.div
      className="relative flex-shrink-0 w-[500px] cursor-pointer"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay: index * 0.1,
        ease: "easeOut"
      }}
      onClick={onClick}
    >
      <div
        className="relative bg-white p-6 shadow-photo hover:shadow-page-hover transition-all duration-300 hover:scale-105"
        style={{
          transform: `rotate(${hike.rotation}deg)`,
          borderRadius: '4px',
        }}
      >
        {/* Photo */}
        <div className="aspect-[4/3] bg-gradient-to-br from-line to-paper relative overflow-hidden mb-5">
          {hike.photos.length > 0 ? (
            <img
              src={hike.photos[0]}
              alt={hike.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-fade font-handwritten text-xl">
              Photos coming soon
            </div>
          )}

          {/* Date stamp */}
          <div
            className="absolute top-3 right-3 bg-paper/95 px-4 py-1.5 font-notes text-sm text-fade shadow-tape border border-line"
            style={{ transform: 'rotate(2deg)' }}
          >
            {hike.date}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          {/* Title */}
          <div className="relative inline-block">
            <h3 className="text-3xl font-handwritten font-bold text-ink">
              {hike.name}
            </h3>
            <svg className="absolute -bottom-1 left-0 w-full" height="4" viewBox="0 0 300 4" fill="none" preserveAspectRatio="none">
              <motion.path
                d="M2 2Q75 1 150 2T298 3"
                stroke="#C67B5C"
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, delay: index * 0.1 + 0.3 }}
              />
            </svg>
          </div>

          <p className="font-handwritten text-lg text-ink-accent">
            {hike.location}
          </p>

          {/* Stats */}
          <div className="flex gap-6 py-2 text-sm">
            <div className="flex items-center gap-1.5">
              <ElevationIcon className="w-4 h-4 text-ink-accent" />
              <span className="font-body text-fade">{hike.elevation}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <DistanceIcon className="w-4 h-4 text-ink-accent" />
              <span className="font-body text-fade">{hike.distance}</span>
            </div>
            <div className="font-body text-fade">
              {hike.difficulty}
            </div>
          </div>

          {/* Review */}
          <blockquote className="font-body text-sm text-ink leading-relaxed border-l-3 border-highlight pl-3 italic">
            "{hike.review}"
          </blockquote>

          {/* Highlights */}
          <div className="pt-2">
            <div className="flex flex-wrap gap-2">
              {hike.highlights.map((highlight, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 bg-ink-accent/10 border border-ink-accent/30 font-notes text-xs text-ink-accent"
                  style={{
                    borderRadius: i % 2 === 0 ? '10px 8px 12px 6px' : '8px 10px 6px 12px',
                    transform: `rotate(${i % 2 === 0 ? '-0.5deg' : '0.5deg'})`
                  }}
                >
                  {highlight}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Washi tape */}
        <motion.div
          className="absolute -top-3 left-[15%] w-20 h-8 opacity-80"
          style={{
            background: 'rgba(200, 180, 150, 0.4)',
            boxShadow: '0 1px 3px rgba(44, 44, 44, 0.1)',
          }}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 0.8, scaleY: 1 }}
          transition={{ delay: index * 0.1 + 0.5, duration: 0.3 }}
        />

        <motion.div
          className="absolute -bottom-3 right-[20%] w-24 h-8 opacity-80"
          style={{
            background: 'rgba(220, 200, 170, 0.35)',
            boxShadow: '0 1px 3px rgba(44, 44, 44, 0.1)',
          }}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 0.8, scaleY: 1 }}
          transition={{ delay: index * 0.1 + 0.6, duration: 0.3 }}
        />

        {/* Corner tapes */}
        <motion.div
          className="corner-tape -top-1 -left-1"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.1 + 0.7, duration: 0.3, ease: "backOut" }}
        />
        <motion.div
          className="corner-tape -top-1 -right-1 -rotate-90"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.1 + 0.75, duration: 0.3, ease: "backOut" }}
        />
      </div>
    </motion.div>
  );
};

const ClimbingPage = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedHike, setSelectedHike] = useState(null);
  const scrollContainerRef = useRef(null);

  // Group hikes by unique month
  const uniqueMonths = [];
  const monthToHikeIndices = {};

  hikesData.forEach((hike, index) => {
    if (!uniqueMonths.includes(hike.date)) {
      uniqueMonths.push(hike.date);
      monthToHikeIndices[hike.date] = [index];
    } else {
      monthToHikeIndices[hike.date].push(index);
    }
  });

  const scrollToCard = (index) => {
    setActiveIndex(index);
    const container = scrollContainerRef.current;
    if (container) {
      // Calculate scroll position: header screen width + (index * screen width for each card)
      const screenWidth = window.innerWidth;
      const targetScroll = screenWidth * (index + 1); // +1 to account for header screen
      container.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      });
    }
  };

  // Track scroll position to update active marker
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const screenWidth = window.innerWidth;
      // Calculate which section we're on (subtract 1 for header, clamp to valid hike indices)
      const section = Math.round(scrollLeft / screenWidth);
      const newIndex = Math.max(0, Math.min(hikesData.length - 1, section - 1));
      if (newIndex !== activeIndex && section >= 1) { // Only update if we're past the header
        setActiveIndex(newIndex);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeIndex]);

  return (
    <>
      <div className="h-screen w-screen overflow-hidden bg-paper relative">
        {/* Vignette */}
        <div className="fixed inset-0 pointer-events-none bg-gradient-radial from-transparent via-transparent to-ink/5 z-10" />

        {/* Back button */}
        <motion.a
          href="/"
          className="fixed top-8 left-8 z-50 flex items-center gap-2 px-5 py-3 bg-paper border-2 border-ink-accent hover:bg-ink-accent/10 shadow-page hover:shadow-page-hover transition-all duration-300 hover:-translate-x-1 group"
          style={{ borderRadius: '20px 18px 22px 16px' }}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <ArrowLeft className="w-5 h-5 text-ink-accent group-hover:-translate-x-1 transition-transform" />
          <span className="font-handwritten text-lg font-bold text-ink-accent">Back to home</span>
        </motion.a>

        {/* Main horizontal scroll container */}
        <div
          ref={scrollContainerRef}
          className="h-full w-full overflow-x-auto overflow-y-hidden horizontal-scroll snap-x snap-mandatory"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#C67B5C #F5F1E8',
          }}
        >
          <div className="h-full flex items-center" style={{ width: 'max-content' }}>
            {/* Section 1: Header */}
            <div className="h-full flex-shrink-0 w-screen flex flex-col items-center justify-center px-12 snap-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="text-center max-w-2xl"
              >
                <div className="flex items-center justify-center gap-4 mb-6">
                  <MountainDoodle className="opacity-60" />
                  <h1 className="text-5xl md:text-6xl font-handwritten font-bold text-ink">
                    Trail Log
                  </h1>
                  <MountainDoodle className="opacity-60 scale-x-[-1]" />
                </div>

                <svg className="mx-auto mb-6" width="350" height="8" viewBox="0 0 350 8" fill="none">
                  <motion.path
                    d="M4 4Q87 2 175 4T346 5"
                    stroke="#C67B5C"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.5, delay: 0.4 }}
                  />
                </svg>

                <p className="font-body text-lg text-ink leading-relaxed mb-8">
                  Every peak tells a story. Scroll right through my Colorado adventures →
                </p>

                {/* Timeline markers - one per unique month */}
                <div className="flex items-start justify-center gap-8 mt-12">
                  {uniqueMonths.map((month, monthIndex) => {
                    const firstHikeIndex = monthToHikeIndices[month][0];
                    const hike = hikesData[firstHikeIndex];
                    // Check if any hike in this month is currently active
                    const isMonthActive = monthToHikeIndices[month].includes(activeIndex);

                    return (
                      <TimelineMarker
                        key={month}
                        hike={hike}
                        index={monthIndex}
                        isActive={isMonthActive}
                        onClick={() => scrollToCard(firstHikeIndex)}
                      />
                    );
                  })}
                </div>

                {/* Horizontal connecting line */}
                <div className="mt-8 flex items-center justify-center">
                  <div className="w-full max-w-3xl">
                    <svg width="100%" height="4" viewBox="0 0 1000 4" preserveAspectRatio="none">
                      <motion.line
                        x1="0"
                        y1="2"
                        x2="1000"
                        y2="2"
                        stroke="#D4CFC4"
                        strokeWidth="3"
                        strokeDasharray="12 8"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 2, delay: 0.6 }}
                      />
                    </svg>
                  </div>
                </div>

                <motion.div
                  className="mt-12 font-handwritten text-xl text-fade"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2, duration: 1 }}
                >
                  Scroll right to explore →
                </motion.div>
              </motion.div>
            </div>

            {/* Section 2-5: Hike cards */}
            {hikesData.map((hike, index) => (
              <div
                key={index}
                className="h-full flex-shrink-0 w-screen flex items-center justify-center px-20 snap-center"
              >
                <HikeCard
                  hike={hike}
                  index={index}
                  onClick={() => setSelectedHike(hike)}
                />
              </div>
            ))}

            {/* Final section: End message */}
            <div className="h-full flex-shrink-0 w-screen flex items-center justify-center px-12 snap-center">
              <motion.div
                className="text-center max-w-xl"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
              >
                <MountainDoodle className="opacity-40 mx-auto mb-6" />
                <h2 className="text-4xl font-handwritten font-bold text-ink mb-4">
                  More peaks to climb
                </h2>
                <p className="font-body text-lg text-fade mb-8">
                  This is just the beginning. The mountains are calling.
                </p>
                <a
                  href="/"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-paper border-2 border-ink-accent hover:bg-ink-accent/10 shadow-page hover:shadow-page-hover transition-all duration-300"
                  style={{ borderRadius: '20px 18px 22px 16px' }}
                >
                  <ArrowLeft className="w-5 h-5 text-ink-accent" />
                  <span className="font-handwritten text-lg font-bold text-ink-accent">Back to home</span>
                </a>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Image Gallery Modal */}
      {selectedHike && (
        <ImageGallery hike={selectedHike} onClose={() => setSelectedHike(null)} />
      )}
    </>
  );
};

export default ClimbingPage;
