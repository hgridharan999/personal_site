import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import ClimateSearchPage from './pages/ClimateSearchPage';
import AscentTrailSense from './ascent/AscentTrailSense';
import HikerHeroScene from './components/HikerHeroScene';
import AscentPage from './ascent/AscentPage';
import AscentWork from './ascent/AscentWork';
import AscentProjects from './ascent/AscentProjects';
import AscentHiking from './ascent/AscentHiking';
import AscentTheses from './ascent/AscentTheses';
import AscentThesis from './ascent/AscentThesis';
import AscentPost from './ascent/AscentPost';
import AscentChat from './ascent/AscentChat';

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.35, ease: 'easeOut' } },
  exit:    { opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } },
};

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ width: '100%', minHeight: '100dvh' }}
      >
        <Routes location={location}>
          {/* The Ascent redesign is now the site. */}
          <Route path="/" element={<AscentPage />} />
          <Route path="/work" element={<AscentWork />} />
          <Route path="/projects" element={<AscentProjects />} />
          <Route path="/hiking" element={<AscentHiking />} />
          <Route path="/theses" element={<AscentTheses />} />
          <Route path="/thesis" element={<AscentThesis />} />
          <Route path="/blog/:slug" element={<AscentPost />} />

          <Route path="/trailsense" element={<AscentTrailSense />} />
          <Route path="/climate-search" element={<div className="asc-climate"><ClimateSearchPage /></div>} />

          {/* Legacy aliases — same components at old paths (no redirect, so the
              page-transition AnimatePresence stays happy). */}
          <Route path="/climbing" element={<AscentHiking />} />
          <Route path="/blog" element={<AscentTheses />} />
          <Route path="/ascent" element={<AscentPage />} />
          <Route path="/ascent/work" element={<AscentWork />} />
          <Route path="/ascent/projects" element={<AscentProjects />} />
          <Route path="/ascent/hiking" element={<AscentHiking />} />
          <Route path="/ascent/theses" element={<AscentTheses />} />
          <Route path="/ascent/thesis" element={<AscentThesis />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

// Backgrounds: the storm hiker on the home page; the two still-original pages
// keep their warm panorama backdrop; every Ascent page owns its dark background.
function GlobalChrome() {
  const { pathname } = useLocation();
  if (pathname === '/' || pathname === '/ascent') return <HikerHeroScene mode="whole-site" animated={false} />;
  return null;
}

function App() {
  return (
    <Router>
      <GlobalChrome />
      <AnimatedRoutes />
      <AscentChat />
    </Router>
  );
}

export default App;
