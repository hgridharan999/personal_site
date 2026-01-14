import React from 'react';
import { Link } from 'react-router-dom';
import { Mountain, Menu, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../ui/Button';

export const Header: React.FC = () => {
  const { isAuthenticated, user } = useAuthStore();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  return (
    <header className="bg-paper border-b-2 border-line sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <Mountain className="w-8 h-8 text-highlight group-hover:scale-110 transition-transform" />
            <span className="font-handwritten text-2xl font-bold text-ink">TrailSense</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  className="font-handwritten text-lg text-ink hover:text-highlight transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  to="/trails"
                  className="font-handwritten text-lg text-ink hover:text-highlight transition-colors"
                >
                  Browse Trails
                </Link>
                <Link
                  to="/recommend"
                  className="font-handwritten text-lg text-ink hover:text-highlight transition-colors"
                >
                  Find a Hike
                </Link>
                <Link
                  to="/my-hikes"
                  className="font-handwritten text-lg text-ink hover:text-highlight transition-colors"
                >
                  My Hikes
                </Link>
                <Link
                  to="/profile"
                  className="font-handwritten text-lg text-ink hover:text-highlight transition-colors"
                >
                  {user?.name || 'Profile'}
                </Link>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="secondary">Log In</Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary">Get Started</Button>
                </Link>
              </>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-ink"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="md:hidden py-4 border-t border-line">
            {isAuthenticated ? (
              <div className="flex flex-col gap-4">
                <Link
                  to="/dashboard"
                  className="font-handwritten text-lg text-ink"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  to="/trails"
                  className="font-handwritten text-lg text-ink"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Browse Trails
                </Link>
                <Link
                  to="/recommend"
                  className="font-handwritten text-lg text-ink"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Find a Hike
                </Link>
                <Link
                  to="/my-hikes"
                  className="font-handwritten text-lg text-ink"
                  onClick={() => setIsMenuOpen(false)}
                >
                  My Hikes
                </Link>
                <Link
                  to="/profile"
                  className="font-handwritten text-lg text-ink"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Profile
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Link to="/login" onClick={() => setIsMenuOpen(false)}>
                  <Button variant="secondary" className="w-full">
                    Log In
                  </Button>
                </Link>
                <Link to="/register" onClick={() => setIsMenuOpen(false)}>
                  <Button variant="primary" className="w-full">
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
          </nav>
        )}
      </div>
    </header>
  );
};
