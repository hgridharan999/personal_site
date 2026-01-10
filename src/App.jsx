import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClimbingPage from './pages/ClimbingPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/climbing" element={<ClimbingPage />} />
      </Routes>
    </Router>
  );
}

export default App;
