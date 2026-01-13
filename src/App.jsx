import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClimbingPage from './pages/ClimbingPage';
import TrailSensePage from './pages/TrailSensePage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/climbing" element={<ClimbingPage />} />
        <Route path="/trailsense" element={<TrailSensePage />} />
      </Routes>
    </Router>
  );
}

export default App;
