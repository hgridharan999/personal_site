import { AlertCircle, CloudRain, Clock } from 'lucide-react';
import ConfidenceScore from './ConfidenceScore';
import BreakdownCard from './BreakdownCard';
import Button from '../ui/Button';

interface AssessmentResultProps {
  assessment: {
    confidence_score: number;
    recommendation: string;
    breakdown: {
      capability: { status: 'good' | 'warning' | 'bad'; notes: string };
      weather: { status: 'good' | 'warning' | 'bad'; notes: string };
      conditions: { status: 'good' | 'warning' | 'bad'; notes: string };
      gear: { status: 'good' | 'warning' | 'bad'; notes: string };
    };
    concerns: string[];
    estimated_time_hours?: number;
    weather_summary?: {
      trailhead_temp_min?: number;
      trailhead_temp_max?: number;
      summit_temp_min?: number;
      summit_temp_max?: number;
      precipitation_prob?: number;
      wind_speed_mph?: number;
    };
    recent_reports?: Array<{
      report_date: string;
      trail_status: string;
      overall_sentiment: string;
      raw_text: string;
    }>;
  };
  onClose: () => void;
  onSave?: () => void;
}

const AssessmentResult = ({ assessment, onClose, onSave }: AssessmentResultProps) => {
  return (
    <div className="bg-paper border-2 border-line p-6 max-w-4xl mx-auto"
      style={{ borderRadius: '4px 8px 6px 10px' }}>

      {/* Confidence Score */}
      <div className="flex flex-col items-center mb-8">
        <h2 className="font-handwritten text-3xl font-bold text-ink mb-6">
          Assessment Results
        </h2>
        <ConfidenceScore score={assessment.confidence_score} size="lg" />
      </div>

      {/* Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <BreakdownCard
          category="capability"
          status={assessment.breakdown.capability.status}
          notes={assessment.breakdown.capability.notes}
        />
        <BreakdownCard
          category="weather"
          status={assessment.breakdown.weather.status}
          notes={assessment.breakdown.weather.notes}
        />
        <BreakdownCard
          category="conditions"
          status={assessment.breakdown.conditions.status}
          notes={assessment.breakdown.conditions.notes}
        />
        <BreakdownCard
          category="gear"
          status={assessment.breakdown.gear.status}
          notes={assessment.breakdown.gear.notes}
        />
      </div>

      {/* Key Concerns */}
      {assessment.concerns && assessment.concerns.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-200"
          style={{ borderRadius: '4px 8px 6px 10px' }}>
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-1" />
            <h3 className="font-handwritten text-xl font-bold text-ink">
              Key Concerns
            </h3>
          </div>
          <ul className="space-y-2">
            {assessment.concerns.map((concern, index) => (
              <li key={index} className="font-body text-sm text-ink/80 flex items-start gap-2">
                <span className="text-yellow-600 font-bold">•</span>
                <span>{concern}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weather Summary */}
      {assessment.weather_summary && (
        <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200"
          style={{ borderRadius: '4px 8px 6px 10px' }}>
          <div className="flex items-center gap-2 mb-3">
            <CloudRain className="w-5 h-5 text-blue-600" />
            <h3 className="font-handwritten text-xl font-bold text-ink">
              Weather Forecast
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-4 font-body text-sm text-ink/80">
            {assessment.weather_summary.trailhead_temp_min !== undefined && (
              <div>
                <span className="font-bold">Trailhead: </span>
                {assessment.weather_summary.trailhead_temp_min}°F - {assessment.weather_summary.trailhead_temp_max}°F
              </div>
            )}
            {assessment.weather_summary.summit_temp_min !== undefined && (
              <div>
                <span className="font-bold">Summit: </span>
                {assessment.weather_summary.summit_temp_min}°F - {assessment.weather_summary.summit_temp_max}°F
              </div>
            )}
            {assessment.weather_summary.precipitation_prob !== undefined && (
              <div>
                <span className="font-bold">Precipitation: </span>
                {assessment.weather_summary.precipitation_prob}%
              </div>
            )}
            {assessment.weather_summary.wind_speed_mph !== undefined && (
              <div>
                <span className="font-bold">Wind: </span>
                {assessment.weather_summary.wind_speed_mph} mph
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trail Details */}
      {assessment.estimated_time_hours && (
        <div className="mb-6 p-4 bg-green-50 border-2 border-green-200"
          style={{ borderRadius: '4px 8px 6px 10px' }}>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-green-600" />
            <h3 className="font-handwritten text-xl font-bold text-ink">
              Estimated Time
            </h3>
          </div>
          <p className="font-body text-sm text-ink/80 mt-2">
            {assessment.estimated_time_hours.toFixed(1)} hours (based on your pace and fitness level)
          </p>
        </div>
      )}

      {/* Recent Trip Reports */}
      {assessment.recent_reports && assessment.recent_reports.length > 0 && (
        <div className="mb-6 p-4 bg-paper/50 border-2 border-line"
          style={{ borderRadius: '4px 8px 6px 10px' }}>
          <h3 className="font-handwritten text-xl font-bold text-ink mb-3">
            Recent Trip Reports
          </h3>
          <div className="space-y-3">
            {assessment.recent_reports.slice(0, 3).map((report, index) => (
              <div key={index} className="p-3 bg-white border border-line rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-notes text-sm text-ink-accent">
                    {new Date(report.report_date).toLocaleDateString()}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    report.overall_sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                    report.overall_sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {report.overall_sentiment}
                  </span>
                </div>
                <p className="font-body text-sm text-ink/70 line-clamp-2">
                  {report.raw_text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {onSave && (
          <Button variant="primary" onClick={onSave}>
            Save to My Hikes
          </Button>
        )}
      </div>
    </div>
  );
};

export default AssessmentResult;
