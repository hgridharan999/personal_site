import React from 'react';
import { Mountain, TrendingUp, MapPin } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import type { Trail } from '../../types';

interface TrailCardProps {
  trail: Trail;
  onClick?: () => void;
}

export const TrailCard: React.FC<TrailCardProps> = ({ trail, onClick }) => {
  const difficultyColors = {
    easy: 'success',
    moderate: 'warning',
    hard: 'error',
    'very-hard': 'error',
  } as const;

  return (
    <Card hover onClick={onClick} className="cursor-pointer">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <h3 className="font-handwritten text-2xl font-bold text-ink">{trail.name}</h3>
          <Badge variant={difficultyColors[trail.difficulty]}>
            {trail.difficulty.replace('-', ' ')}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-4 text-sm font-body text-ink/80">
          <div className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            <span>{trail.distance_miles} miles</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            <span>{trail.elevation_gain_ft} ft gain</span>
          </div>
          <div className="flex items-center gap-1">
            <Mountain className="w-4 h-4" />
            <span>{trail.trail_type}</span>
          </div>
        </div>

        {trail.features.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {trail.features.slice(0, 3).map((feature) => (
              <span
                key={feature}
                className="px-2 py-1 bg-highlight/10 border border-highlight/30 text-xs font-notes text-ink-accent rounded-full"
              >
                {feature}
              </span>
            ))}
            {trail.features.length > 3 && (
              <span className="px-2 py-1 text-xs font-notes text-fade">
                +{trail.features.length - 3} more
              </span>
            )}
          </div>
        )}

        {trail.route_description && (
          <p className="font-body text-sm text-ink/70 line-clamp-2">
            {trail.route_description}
          </p>
        )}
      </div>
    </Card>
  );
};
