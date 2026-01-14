import { useState } from 'react';
import { ChevronDown, ChevronUp, Mountain, TrendingUp, Clock, Car } from 'lucide-react';
import ConfidenceScore from '../assessment/ConfidenceScore';
import AssessmentResult from '../assessment/AssessmentResult';
import Badge from '../ui/Badge';

interface RecommendationCardProps {
  rank: number;
  trail: {
    id: string;
    name: string;
    distance_miles: number;
    elevation_gain_ft: number;
    difficulty: string;
    terrain_types?: string[];
    features?: string[];
    photos?: string[];
  };
  confidence_score: number;
  drive_time_minutes: number;
  why_recommended: string;
  assessment: any;
  onSave?: () => void;
}

const RecommendationCard = ({
  rank,
  trail,
  confidence_score,
  drive_time_minutes,
  why_recommended,
  assessment,
  onSave
}: RecommendationCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDriveTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}min`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}min`;
  };

  return (
    <div
      className="bg-paper/50 border-2 border-line transition-all duration-300 hover:shadow-lg hover:translate-x-1 hover:-translate-y-1"
      style={{ borderRadius: '4px 8px 6px 10px' }}
    >
      {/* Collapsed View */}
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-highlight text-paper font-handwritten text-2xl font-bold flex items-center justify-center rounded-full">
              {rank}
            </div>
            <div className="flex-1">
              <h3 className="font-handwritten text-2xl font-bold text-ink mb-1">
                {trail.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-sm font-body text-ink/70">
                <span className="flex items-center gap-1">
                  <Mountain className="w-4 h-4" />
                  {trail.distance_miles} mi
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  {trail.elevation_gain_ft} ft gain
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Car className="w-4 h-4" />
                  {formatDriveTime(drive_time_minutes)} drive
                </span>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0">
            <ConfidenceScore score={confidence_score} size="sm" />
          </div>
        </div>

        {/* Terrain and Features */}
        <div className="flex flex-wrap gap-2 mb-4">
          {trail.terrain_types?.map(terrain => (
            <Badge key={terrain} variant="success">
              {terrain}
            </Badge>
          ))}
          {trail.features?.slice(0, 3).map(feature => (
            <Badge key={feature} variant="default">
              {feature}
            </Badge>
          ))}
        </div>

        {/* Why Recommended */}
        <p className="font-body text-base text-ink/80 mb-4">
          <span className="font-bold">Why: </span>
          {why_recommended}
        </p>

        {/* Expand/Collapse Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-4 py-2 bg-ink-accent/10 border border-ink-accent/30 font-handwritten text-base text-ink-accent hover:bg-ink-accent/20 transition-colors w-full justify-center"
          style={{ borderRadius: '4px 8px 6px 10px' }}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-5 h-5" />
              Hide Full Assessment
            </>
          ) : (
            <>
              <ChevronDown className="w-5 h-5" />
              Show Full Assessment
            </>
          )}
        </button>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <div className="border-t-2 border-line p-6">
          <AssessmentResult
            assessment={assessment}
            onClose={() => setIsExpanded(false)}
            onSave={onSave}
          />
        </div>
      )}
    </div>
  );
};

export default RecommendationCard;
