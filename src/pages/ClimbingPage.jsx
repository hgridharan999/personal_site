import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { ElevationIcon, DistanceIcon } from '../components/HandDrawnElements';
import { Link } from 'react-router-dom';

const hikesData = [
  {
    date: "June 2025",
    name: "Mt. Bierstadt",
    location: "Colorado",
    elevation: "14,065 ft",
    distance: "7.0 mi",
    difficulty: "Moderate",
    photos: ["/bierstadt-1.jpg", "/bierstadt-2.jpg", "/bierstadt-3.jpg"],
    review: "My first fourteener summit. May be the hardest and also most rewarding thing I've ever done. Started at 5 AM under headlamp, watching the sky slowly lighten. Did NOT pick the right time of year — still 6+ feet of snow the last 1000 feet and no gear. Also managed to lose my phone on the summit but found it 2 hours later using Find My :).",
    highlights: ["First 14er", "Alpine start", "Above treeline"],
  },
  {
    date: "August 2025",
    name: "Sky Pond",
    location: "Rocky Mountain National Park",
    elevation: "10,900 ft",
    distance: "9.0 mi",
    difficulty: "Strenuous",
    photos: ["/skypond-1.jpg", "/skypond-2.jpg", "/skypond-3.jpg", "/skypond-4.jpg"],
    review: "May be some of the best views in Colorado. Started before sunrise and caught it through gorgeous forests and lakes. The waterfall scramble at the end was insanely fun — we did an additional one just for kicks. Only regret was not being able to cliff jump, it was too cold.",
    highlights: ["Boulder scramble", "Lake of Glass", "Waterfall climbs"],
  },
  {
    date: "November 2025",
    name: "Lost Lake",
    location: "Indian Peaks Wilderness",
    elevation: "10,700 ft",
    distance: "8.2 mi",
    difficulty: "Moderate",
    photos: ["/lostlake-1.jpg", "/lostlake-2.jpg", "/lostlake-3.jpg", "/lostlake-4.jpg"],
    review: "First truly winter hike. Winds over 50 mph with zero visibility when we arrived — thankfully it cleared. Got a bit lost, climbed an extra mountain for cell service. Ended at a beautiful frozen lake where my boot got completely soaked with ice cold water. Played some football at the top.",
    highlights: ["50mph winds", "Frozen lake", "Winter conditions"],
  },
  {
    date: "January 2026",
    name: "Escondido Falls",
    location: "Malibu, California",
    elevation: "400 ft",
    distance: "3.8 mi",
    difficulty: "Easy",
    photos: ["/escondido-1.jpg", "/escondido-2.jpg", "/escondido-3.jpg", "/escondido-4.jpg"],
    review: "Great coastal hike in the LA area. Rain all week made the trail pure mud and added tons of river crossings. The waterfall was 100% worth getting my shoes soaked. Beautiful ocean views on the way back as the sun set.",
    highlights: ["Coastal trail", "Hidden waterfall", "Ocean views"],
  },
  {
    date: "January 2026",
    name: "Seven Falls",
    location: "Santa Barbara, California",
    elevation: "1,500 ft",
    distance: "8.8 mi",
    difficulty: "Hard",
    photos: [],
    review: "Starts light, then a crazy river crossing, then a 60° incline up a mountain, then a 70–85° cable-assisted descent to the actual falls. From there, climbed another mountain to see all seven falls together. Genuinely technical.",
    highlights: ["85° incline", "Cable descent", "Technical climb"],
  },
];

const ImageGallery = ({ hike, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/80 backdrop-blur-sm p-3 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative bg-paper-subtle p-5 sm:p-6 max-w-4xl w-full max-h-[90vh] overflow-auto shadow-page-hover rounded-lg border border-line"
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 hover:bg-line/50 rounded-sm transition-colors"
        >
          <X className="w-5 h-5 text-ink" />
        </button>

        <div className="mb-6">
          <h2 className="font-handwritten text-3xl sm:text-4xl font-bold text-ink mb-1">{hike.name}</h2>
          <p className="font-handwritten text-lg sm:text-xl text-ink-accent mb-3">{hike.location}</p>
          <div className="flex flex-wrap gap-3 sm:gap-4 font-body text-sm text-fade">
            <span className="flex items-center gap-1"><ElevationIcon className="w-4 h-4" /> {hike.elevation}</span>
            <span className="flex items-center gap-1"><DistanceIcon className="w-4 h-4" /> {hike.distance}</span>
            <span>{hike.difficulty}</span>
          </div>
        </div>

        <div className="aspect-[16/10] bg-line relative overflow-hidden mb-4 rounded-sm">
          {hike.photos.length > 0 ? (
            <img
              src={hike.photos[currentIndex]}
              alt={`${hike.name} - Photo ${currentIndex + 1}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-handwritten text-2xl text-fade">
              Photos coming soon
            </div>
          )}
          <div className="absolute top-3 right-3 bg-paper/95 px-3 py-1 font-body text-sm text-fade border border-line rounded-sm">
            {hike.date}
          </div>
        </div>

        {hike.photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
            {hike.photos.map((photo, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`aspect-[4/3] overflow-hidden rounded-sm transition-all ${
                  currentIndex === index ? 'ring-2 ring-highlight' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <img src={photo} alt={`${hike.name} thumbnail ${index + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <blockquote className="font-body text-base text-ink leading-relaxed border-l-2 border-highlight pl-4 italic mb-4">
          {hike.review}
        </blockquote>

        <p className="font-body text-sm text-fade">
          {hike.highlights.join(' · ')}
        </p>
      </motion.div>
    </motion.div>
  );
};

const HikeCard = ({ hike, index, onClick }) => {
  return (
    <motion.div
      className="cursor-pointer group border border-line rounded-lg p-4 bg-paper/80 shadow-card flex flex-col justify-center min-h-0 overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 + index * 0.05, ease: "easeOut" }}
      onClick={onClick}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="font-handwritten text-xl font-bold text-ink group-hover:text-ink-accent transition-colors">{hike.name}</h3>
        <span className="font-body text-xs sm:text-sm text-fade whitespace-nowrap flex-shrink-0">{hike.date}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-body text-xs sm:text-sm text-fade">
        <span className="text-ink-accent">{hike.location}</span>
        <span>·</span>
        <span className="flex items-center gap-1"><ElevationIcon className="w-3 h-3" />{hike.elevation}</span>
        <span>·</span>
        <span className="flex items-center gap-1"><DistanceIcon className="w-3 h-3" />{hike.distance}</span>
        <span>·</span>
        <span>{hike.difficulty}</span>
      </div>
      <p className="font-body text-xs text-fade mt-1">{hike.highlights.join(' · ')}</p>
    </motion.div>
  );
};

const ClimbingPage = () => {
  const [selectedHike, setSelectedHike] = useState(null);

  return (
    <>
      <div className="h-[100dvh] overflow-hidden bg-paper flex flex-col items-center px-5 sm:px-8 pt-4 pb-5">
      <div className="max-w-5xl w-full flex flex-col flex-1 min-h-0">
        <motion.div
          className="mb-2"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-body text-sm text-fade hover:text-ink-accent transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            home
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mb-4"
        >
          <h1 className="page-title-underline inline-block font-handwritten text-3xl font-bold text-ink leading-none">Trail Log</h1>
          <p className="font-body text-sm text-ink-accent mt-2">
            I love hiking and will love it till I die. Click any entry for photos.
          </p>
        </motion.div>

        <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 auto-rows-fr gap-3">
          {hikesData.map((hike, index) => (
            <HikeCard key={index} hike={hike} index={index} onClick={() => setSelectedHike(hike)} />
          ))}
        </div>
      </div>
      </div>

      {selectedHike && (
        <ImageGallery hike={selectedHike} onClose={() => setSelectedHike(null)} />
      )}
    </>
  );
};

export default ClimbingPage;
