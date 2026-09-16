import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
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
import CookieConsentBanner from './components/CookieConsentBanner';
import LegalPage from './pages/LegalPage';
import LoginPage from './private/LoginPage';
import PrivateHome from './private/PrivateHome';
import PrivateShell from './private/PrivateShell';
import RequireAuth from './private/RequireAuth';

// Trainer code is lazy-loaded: public visitors never download it.
const TrainerPage = lazy(() => import('./private/trainers/TrainerPage'));
const GameDetail = lazy(() => import('./private/trainers/stats/GameDetail'));
const PokerLobbyPage = lazy(() => import('./private/trainers/poker/ui/lobby/PokerLobbyPage'));
const PokerTablePage = lazy(() => import('./private/trainers/poker/lib/persistence/PersistedTablePage'));

const privateFallback = (
  <PrivateShell className="prv-center">
    <span className="asc-mono prv-status" role="status">Loading…</span>
  </PrivateShell>
);

// Routes render directly — each page owns its entrance animation. (No
// AnimatePresence crossfade: mode="wait" could block the incoming page from
// mounting until the outgoing exit finished, which occasionally left a route
// "not loading". A direct swap always mounts the new page immediately.)
function AnimatedRoutes() {
  const location = useLocation();
  return (
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
      <Route path="/privacy" element={<LegalPage />} />
      <Route path="/terms" element={<LegalPage />} />
      <Route path="/legal" element={<LegalPage />} />

      {/* Private area — reached via the hidden link on the home page. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/me" element={<RequireAuth>{({ logout }) => <PrivateHome onLogout={logout} />}</RequireAuth>} />
      {/* Poker has its own pages; these must come before the generic /me/:trainer route. */}
      <Route
        path="/me/poker"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><PokerLobbyPage /></Suspense>}</RequireAuth>}
      />
      <Route
        path="/me/poker/table/:sessionId"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><PokerTablePage /></Suspense>}</RequireAuth>}
      />
      <Route
        path="/me/:trainer"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><TrainerPage /></Suspense>}</RequireAuth>}
      />
      <Route
        path="/me/:trainer/game/:id"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><GameDetail /></Suspense>}</RequireAuth>}
      />

      {/* Legacy aliases — same components at old paths. */}
      <Route path="/climbing" element={<AscentHiking />} />
      <Route path="/blog" element={<AscentTheses />} />
      <Route path="/ascent" element={<AscentPage />} />
      <Route path="/ascent/work" element={<AscentWork />} />
      <Route path="/ascent/projects" element={<AscentProjects />} />
      <Route path="/ascent/hiking" element={<AscentHiking />} />
      <Route path="/ascent/theses" element={<AscentTheses />} />
      <Route path="/ascent/thesis" element={<AscentThesis />} />
    </Routes>
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
      <CookieConsentBanner />
    </Router>
  );
}

export default App;
