import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import HomePage from './home/HomePage';
import ScrollToTop from './components/ScrollToTop';

// Everything but the homepage loads on demand, so a visitor to "/" downloads only
// the homepage: the post page carries markdown, and the private shell carries ascent.css,
// private.css and the animation libraries. The old Ascent and climate-search page files
// (src/ascent, src/pages/ClimateSearch*) stay on disk, unrouted.
const PrivateShell = lazy(() => import('./private/PrivateShell'));
const RequireAuth = lazy(() => import('./private/RequireAuth'));
const HikingPage = lazy(() => import('./site/hiking/HikingPage'));
const ThesesPage = lazy(() => import('./site/ThesesPage'));
const PostPage = lazy(() => import('./site/PostPage'));
const ClimateSearchPage = lazy(() => import('./site/climate/ClimateSearchPage'));
const LegalPage = lazy(() => import('./pages/LegalPage'));
const LoginPage = lazy(() => import('./private/LoginPage'));
const PrivateHome = lazy(() => import('./private/PrivateHome'));

// Trainer code is lazy-loaded: public visitors never download it.
const TrainerPage = lazy(() => import('./private/trainers/TrainerPage'));
const GameDetail = lazy(() => import('./private/trainers/stats/GameDetail'));
const PokerLobbyPage = lazy(() => import('./private/trainers/poker/ui/lobby/PokerLobbyPage'));
const PokerTablePage = lazy(() => import('./private/trainers/poker/lib/persistence/PersistedTablePage'));
const PokerSessionReviewPage = lazy(() => import('./private/trainers/poker/ui/review/SessionReviewPage'));
const PokerHandReplayerPage = lazy(() => import('./private/trainers/poker/ui/replayer/HandReplayerPage'));

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
    <Suspense fallback={null}>
    <Routes location={location}>
      {/* Site v2: a single homepage and the pages it links to, all in the homepage's
          light look (src/site). The old Ascent and climate pages, and the rest (work,
          projects, thesis, trailsense), are unrouted but their files stay on disk,
          and vercel.json 301s their old URLs. */}
      <Route path="/" element={<HomePage />} />
      <Route path="/hiking" element={<HikingPage />} />
      <Route path="/theses" element={<ThesesPage />} />
      <Route path="/blog/:slug" element={<PostPage />} />

      <Route path="/climate-search" element={<ClimateSearchPage />} />
      <Route path="/privacy" element={<LegalPage />} />
      <Route path="/terms" element={<LegalPage />} />
      <Route path="/legal" element={<LegalPage />} />

      {/* Private area: reachable by URL only (no public page links to it). */}
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
        path="/me/poker/session/:id"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><PokerSessionReviewPage /></Suspense>}</RequireAuth>}
      />
      <Route
        path="/me/poker/hand/:id"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><PokerHandReplayerPage /></Suspense>}</RequireAuth>}
      />
      <Route
        path="/me/:trainer"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><TrainerPage /></Suspense>}</RequireAuth>}
      />
      <Route
        path="/me/:trainer/game/:id"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><GameDetail /></Suspense>}</RequireAuth>}
      />

      {/* Unknown and removed paths go home. Vercel 301s the removed ones before
          the SPA loads; this catches client-side navigation and anything else. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <AnimatedRoutes />
    </Router>
  );
}

export default App;
