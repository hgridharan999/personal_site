import RecommendationCard from './RecommendationCard';
import { AlertCircle } from 'lucide-react';

interface RecommendationListProps {
  recommendations: Array<{
    trail: any;
    confidence_score: number;
    drive_time_minutes: number;
    why_recommended: string;
    assessment: any;
  }>;
  message?: string | null;
  onSave?: (trailId: string) => void;
}

const RecommendationList = ({ recommendations, message, onSave }: RecommendationListProps) => {
  if (recommendations.length === 0) {
    return (
      <div className="bg-yellow-50 border-2 border-yellow-200 p-6 text-center"
        style={{ borderRadius: '4px 8px 6px 10px' }}>
        <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
        <h3 className="font-handwritten text-2xl font-bold text-ink mb-2">
          No Hikes Found
        </h3>
        <p className="font-body text-base text-ink/80">
          We couldn't find any hikes matching your criteria. Try relaxing your distance or drive time constraints.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Message if fewer than 5 results */}
      {message && (
        <div className="bg-blue-50 border-2 border-blue-200 p-4"
          style={{ borderRadius: '4px 8px 6px 10px' }}>
          <p className="font-body text-base text-ink/80 text-center">
            {message}
          </p>
        </div>
      )}

      {/* Recommendation Cards */}
      <div className="space-y-4">
        {recommendations.map((rec, index) => (
          <RecommendationCard
            key={rec.trail.id}
            rank={index + 1}
            trail={rec.trail}
            confidence_score={rec.confidence_score}
            drive_time_minutes={rec.drive_time_minutes}
            why_recommended={rec.why_recommended}
            assessment={rec.assessment}
            onSave={onSave ? () => onSave(rec.trail.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
};

export default RecommendationList;
