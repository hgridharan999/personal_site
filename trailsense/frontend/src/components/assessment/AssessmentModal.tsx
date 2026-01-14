import { useState } from 'react';
import { X } from 'lucide-react';
import Button from '../ui/Button';
import GearChecklist from './GearChecklist';

interface AssessmentModalProps {
  trailId: string;
  onClose: () => void;
  onSubmit: (data: { date: string; gear: string[] }) => void;
  isLoading?: boolean;
  initialGear?: string[];
}

const AssessmentModal = ({
  trailId,
  onClose,
  onSubmit,
  isLoading = false,
  initialGear = []
}: AssessmentModalProps) => {
  const getUpcomingSaturday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + daysUntilSaturday);
    return saturday.toISOString().split('T')[0];
  };

  const [date, setDate] = useState(getUpcomingSaturday());
  const [gear, setGear] = useState<string[]>(initialGear);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ date, gear });
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
            Assess This Hike
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
          {/* Date Picker */}
          <div>
            <label htmlFor="date" className="block font-handwritten text-lg font-bold text-ink mb-2">
              When are you planning to hike?
            </label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 bg-paper border-2 border-line font-body text-ink focus:border-ink-accent focus:outline-none transition-colors"
              style={{ borderRadius: '4px 8px 6px 10px' }}
              required
            />
          </div>

          {/* Gear Checklist */}
          <GearChecklist selectedGear={gear} onChange={setGear} />

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
              {isLoading ? 'Assessing...' : 'Assess Hike'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AssessmentModal;
