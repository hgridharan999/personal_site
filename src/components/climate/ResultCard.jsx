/**
 * ResultCard Component
 * Hand-drawn paper card displaying a single climate startup
 */

import { ExternalLink, MapPin, Calendar, DollarSign } from 'lucide-react';

export default function ResultCard({ result, rank, onView }) {
  const { startup, score } = result;

  const formatFunding = (amount) => {
    if (!amount || amount === 0) return 'Undisclosed';
    
    if (amount >= 1000000000) {
      return `$${(amount / 1000000000).toFixed(1)}B`;
    } else if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount}`;
  };

  const websiteUrl = startup.website_url ||
    `https://www.google.com/search?q=${encodeURIComponent(startup.name + ' climate startup')}`;

  const handleClick = () => {
    if (onView) {
      onView(startup.id, rank);
    }
  };

  const rotations = ['rotate-1', '-rotate-1', 'rotate-0'];
  const rotation = rotations[rank % 3];

  return (
    <div
      className={`
        relative bg-paper/50 p-6 md:p-8
        border-2 border-line rounded-sm
        shadow-page
        hover:shadow-page-hover
        hover:translate-x-1 hover:-translate-y-1
        transition-all duration-300
        transform ${rotation}
        hover:rotate-0
      `}
    >
      {/* Company Name */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <h3 className="text-2xl md:text-3xl font-handwritten font-bold text-ink leading-tight">
          {startup.name}
        </h3>
        
        {/* Website Link */}
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className="flex-shrink-0 text-highlight hover:text-ink transition-colors"
          aria-label={`Visit ${startup.name} website`}
          title={startup.website_url ? startup.name : `Search ${startup.name}`}
        >
          <ExternalLink className="w-5 h-5 md:w-6 md:h-6" />
        </a>
      </div>

      {/* Description */}
      <p className="font-body text-base md:text-lg text-ink leading-relaxed mb-4">
        {startup.short_description}
      </p>

      {/* Vertical Tag */}
      <div className="mb-4">
        <span className="tech-bubble">
          {startup.primary_vertical?.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap gap-4 text-sm font-notes text-fade">
        {startup.headquarters_location && (
          <div className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            <span>{startup.headquarters_location}</span>
          </div>
        )}

        {startup.founded_year && (
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>Founded {startup.founded_year}</span>
          </div>
        )}

        {startup.total_funding_usd !== undefined && (
          <div className="flex items-center gap-1">
            <DollarSign className="w-4 h-4" />
            <span>{formatFunding(startup.total_funding_usd)} raised</span>
          </div>
        )}
      </div>

      {/* Relevance Score (subtle, for development) */}
      {score !== undefined && (
        <div className="absolute top-2 right-2 opacity-30">
          <span className="text-xs font-notes text-fade">
            {(score * 100).toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}
