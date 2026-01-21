import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClimbingPage from './pages/ClimbingPage';
import TrailSensePage from './pages/TrailSensePage';
import ClimateSearchPage from './pages/ClimateSearchPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/climbing" element={<ClimbingPage />} />
        <Route path="/trailsense" element={<TrailSensePage />} />
        <Route path="/climate-search" element={<ClimateSearchPage />} />
      </Routes>
    </Router>
  );
}

export default App;
