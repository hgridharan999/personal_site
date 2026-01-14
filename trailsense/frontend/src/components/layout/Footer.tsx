import React from 'react';
import { Mountain } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-line/20 border-t-2 border-line mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Mountain className="w-6 h-6 text-highlight" />
            <span className="font-handwritten text-xl font-bold text-ink">TrailSense</span>
          </div>

          <div className="text-center md:text-right">
            <p className="font-body text-sm text-fade">
              Weather data from{' '}
              <a
                href="https://www.weather.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-accent hover:text-highlight"
              >
                National Weather Service
              </a>
            </p>
            <p className="font-body text-sm text-fade mt-1">
              Always check current conditions and use your best judgment before hiking.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-line text-center">
          <p className="font-notes text-sm text-fade">
            Made with care for safer, smarter hiking decisions.
          </p>
        </div>
      </div>
    </footer>
  );
};
