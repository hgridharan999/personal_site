import { useState } from 'react';
import { X, Star } from 'lucide-react';
import Button from '../ui/Button';

interface HikeLogFormProps {
  onClose: () => void;
  onSubmit: (data: HikeLogData) => void;
  isLoading?: boolean;
  trails?: Array<{ id: string; name: string }>;
}

export interface HikeLogData {
  trail_id?: string;
  trail_name?: string;
  hike_date: string;
  completed: boolean;
  difficulty_rating: number;
  time_taken_hours: number;
  notes: string;
}

const DIFFICULTY_LABELS = [
  'Too Easy',
  'Easier than expected',
  'As expected',
  'Harder than expected',
  'Too Hard'
];

const HikeLogForm = ({ onClose, onSubmit, isLoading = false, trails = [] }: HikeLogFormProps) => {
  const [useManual, setUseManual] = useState(trails.length === 0);
  const [trailId, setTrailId] = useState('');
  const [trailName, setTrailName] = useState('');
  const [hikeDate, setHikeDate] = useState(new Date().toISOString().split('T')[0]);
  const [completed, setCompleted] = useState(true);
  const [difficultyRating, setDifficultyRating] = useState(3);
  const [timeTaken, setTimeTaken] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      trail_id: useManual ? undefined : trailId,
      trail_name: useManual ? trailName : undefined,
      hike_date: hikeDate,
      completed,
      difficulty_rating: difficultyRating,
      time_taken_hours: parseFloat(timeTaken),
      notes
    });
  };

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-paper border-2 border-line p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ borderRadius: '4px 8px 6px 10px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-handwritten text-3xl font-bold text-ink">
            Log a Hike
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-line rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-ink" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Trail Selection */}
          <div>
            <label className="block font-handwritten text-lg font-bold text-ink mb-2">
              Which trail did you hike?
            </label>

            {trails.length > 0 && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setUseManual(!useManual)}
                  className="text-sm font-body text-ink-accent hover:underline"
                >
                  {useManual ? 'Select from assessed trails' : 'Enter trail name manually'}
                </button>
              </div>
            )}

            {useManual ? (
              <input
                type="text"
                value={trailName}
                onChange={(e) => setTrailName(e.target.value)}
                placeholder="Enter trail name"
                className="w-full px-4 py-2 bg-paper border-2 border-line font-body text-ink focus:border-ink-accent focus:outline-none transition-colors"
                style={{ borderRadius: '4px 8px 6px 10px' }}
                required
              />
            ) : (
              <select
                value={trailId}
                onChange={(e) => setTrailId(e.target.value)}
                className="w-full px-4 py-2 bg-paper border-2 border-line font-body text-ink focus:border-ink-accent focus:outline-none transition-colors"
                style={{ borderRadius: '4px 8px 6px 10px' }}
                required
              >
                <option value="">Select a trail...</option>
                {trails.map(trail => (
                  <option key={trail.id} value={trail.id}>
                    {trail.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Hike Date */}
          <div>
            <label htmlFor="hike-date" className="block font-handwritten text-lg font-bold text-ink mb-2">
              When did you hike?
            </label>
            <input
              type="date"
              id="hike-date"
              value={hikeDate}
              onChange={(e) => setHikeDate(e.target.value)}
              className="w-full px-4 py-2 bg-paper border-2 border-line font-body text-ink focus:border-ink-accent focus:outline-none transition-colors"
              style={{ borderRadius: '4px 8px 6px 10px' }}
              required
            />
          </div>

          {/* Completed */}
          <div>
            <label className="block font-handwritten text-lg font-bold text-ink mb-2">
              Did you complete it?
            </label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setCompleted(true)}
                className={`flex-1 px-4 py-2 font-handwritten text-base border-2 transition-all ${
                  completed
                    ? 'bg-green-50 border-green-500 text-green-700'
                    : 'bg-paper border-line text-ink hover:border-ink-accent'
                }`}
                style={{ borderRadius: '4px 8px 6px 10px' }}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setCompleted(false)}
                className={`flex-1 px-4 py-2 font-handwritten text-base border-2 transition-all ${
                  !completed
                    ? 'bg-red-50 border-red-500 text-red-700'
                    : 'bg-paper border-line text-ink hover:border-ink-accent'
                }`}
                style={{ borderRadius: '4px 8px 6px 10px' }}
              >
                No (turned back)
              </button>
            </div>
          </div>

          {/* Difficulty Rating */}
          <div>
            <label className="block font-handwritten text-lg font-bold text-ink mb-2">
              How hard was it?
            </label>
            <div className="flex justify-between items-center mb-2">
              {[1, 2, 3, 4, 5].map(rating => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setDifficultyRating(rating)}
                  className="p-2 hover:scale-110 transition-transform"
                >
                  <Star
                    className={`w-8 h-8 ${
                      rating <= difficultyRating
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-center font-notes text-sm text-ink-accent">
              {DIFFICULTY_LABELS[difficultyRating - 1]}
            </p>
          </div>

          {/* Time Taken */}
          <div>
            <label htmlFor="time-taken" className="block font-handwritten text-lg font-bold text-ink mb-2">
              How long did it take? (hours)
            </label>
            <input
              type="number"
              id="time-taken"
              value={timeTaken}
              onChange={(e) => setTimeTaken(e.target.value)}
              step="0.5"
              min="0"
              placeholder="e.g., 5.5"
              className="w-full px-4 py-2 bg-paper border-2 border-line font-body text-ink focus:border-ink-accent focus:outline-none transition-colors"
              style={{ borderRadius: '4px 8px 6px 10px' }}
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block font-handwritten text-lg font-bold text-ink mb-2">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any thoughts about the hike?"
              rows={4}
              className="w-full px-4 py-2 bg-paper border-2 border-line font-body text-ink focus:border-ink-accent focus:outline-none transition-colors resize-none"
              style={{ borderRadius: '4px 8px 6px 10px' }}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Log Hike'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default HikeLogForm;
