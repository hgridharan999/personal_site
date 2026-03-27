import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClimbingPage from './pages/ClimbingPage';
import TrailSensePage from './pages/TrailSensePage';
import ClimateSearchPage from './pages/ClimateSearchPage';
import ProjectsPage from './pages/ProjectsPage';
import WorkPage from './pages/WorkPage';
import BlogPage from './pages/BlogPage';
import BlogPostPage from './pages/BlogPostPage';
import ChatWidget from './components/ChatWidget';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/work" element={<WorkPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/climbing" element={<ClimbingPage />} />
        <Route path="/trailsense" element={<TrailSensePage />} />
        <Route path="/climate-search" element={<ClimateSearchPage />} />
      </Routes>
      <ChatWidget />
    </Router>
  );
}

export default App;
