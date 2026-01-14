import { Calendar, Clock, Star, Trash2, Edit2 } from 'lucide-react';
import Badge from '../ui/Badge';

interface HikeLogCardProps {
  hike: {
    id: string;
    trail_name: string;
    hike_date: string;
    completed: boolean;
    difficulty_rating: number;
    time_taken_hours: number;
    notes?: string;
  };
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const DIFFICULTY_LABELS = [
  'Too Easy',
  'Easier than expected',
  'As expected',
  'Harder than expected',
  'Too Hard'
];

const HikeLogCard = ({ hike, onEdit, onDelete }: HikeLogCardProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div
      className="bg-paper/50 border-2 border-line p-6 transition-all duration-300 hover:shadow-lg hover:translate-x-1 hover:-translate-y-1"
      style={{ borderRadius: '4px 8px 6px 10px' }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <h3 className="font-handwritten text-2xl font-bold text-ink mb-2">
            {hike.trail_name}
          </h3>

          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="flex items-center gap-1 font-body text-sm text-ink/70">
              <Calendar className="w-4 h-4" />
              {formatDate(hike.hike_date)}
            </span>

            {hike.time_taken_hours && (
              <span className="flex items-center gap-1 font-body text-sm text-ink/70">
                <Clock className="w-4 h-4" />
                {hike.time_taken_hours} hours
              </span>
            )}

            <Badge variant={hike.completed ? 'success' : 'warning'}>
              {hike.completed ? 'Completed' : 'Turned back'}
            </Badge>
          </div>

          {/* Difficulty Rating */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(rating => (
                <Star
                  key={rating}
                  className={`w-5 h-5 ${
                    rating <= hike.difficulty_rating
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
            <span className="font-notes text-sm text-ink-accent">
              {DIFFICULTY_LABELS[hike.difficulty_rating - 1]}
            </span>
          </div>

          {/* Notes */}
          {hike.notes && (
            <p className="font-body text-base text-ink/80 leading-relaxed line-clamp-2">
              {hike.notes}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          {onEdit && (
            <button
              onClick={() => onEdit(hike.id)}
              className="p-2 bg-ink-accent/10 border border-ink-accent/30 hover:bg-ink-accent/20 transition-colors rounded"
              aria-label="Edit hike"
            >
              <Edit2 className="w-4 h-4 text-ink-accent" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(hike.id)}
              className="p-2 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors rounded"
              aria-label="Delete hike"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default HikeLogCard;
