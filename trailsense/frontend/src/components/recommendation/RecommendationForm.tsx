import { useState } from 'react';
import Button from '../ui/Button';
import Slider from '../ui/Slider';
import Checkbox from '../ui/Checkbox';

interface RecommendationFormProps {
  onSubmit: (constraints: RecommendationConstraints) => void;
  isLoading?: boolean;
}

export interface RecommendationConstraints {
  date: string;
  max_distance: number;
  max_elevation_gain: number;
  max_drive_time_minutes: number;
  terrain_preferences: string[];
  desired_features: string[];
  avoid: string[];
  difficulty: string | null;
}

const TERRAIN_OPTIONS = [
  { id: 'alpine', label: 'Alpine/Above treeline' },
  { id: 'forest', label: 'Forest' },
  { id: 'desert', label: 'Desert' },
  { id: 'coastal', label: 'Coastal' },
  { id: 'canyon', label: 'Canyon/Gorge' },
  { id: 'lake', label: 'Lake/Water features' },
  { id: 'summit', label: 'Summit/Peak' }
];

const FEATURE_OPTIONS = [
  { id: 'lake', label: 'Lake' },
  { id: 'waterfall', label: 'Waterfall' },
  { id: 'summit_views', label: 'Summit views' },
  { id: 'hot_springs', label: 'Hot springs' },
  { id: 'wildlife', label: 'Wildlife viewing' },
  { id: 'fall_colors', label: 'Fall colors' },
  { id: 'wildflowers', label: 'Wildflowers' }
];

const AVOID_OPTIONS = [
  { id: 'crowds', label: 'Crowds (high traffic trails)' },
  { id: 'fees', label: 'Fees/Permits required' },
  { id: 'dogs_leashed', label: 'Dogs must be leashed' }
];

const RecommendationForm = ({ onSubmit, isLoading = false }: RecommendationFormProps) => {
  const getUpcomingSaturday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + daysUntilSaturday);
    return saturday.toISOString().split('T')[0];
  };

  const [date, setDate] = useState(getUpcomingSaturday());
  const [maxDistance, setMaxDistance] = useState(15);
  const [maxElevation, setMaxElevation] = useState(3500);
  const [maxDriveTime, setMaxDriveTime] = useState(120);
  const [terrainPreferences, setTerrainPreferences] = useState<string[]>([]);
  const [desiredFeatures, setDesiredFeatures] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<string>('any');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      date,
      max_distance: maxDistance,
      max_elevation_gain: maxElevation,
      max_drive_time_minutes: maxDriveTime,
      terrain_preferences: terrainPreferences,
      desired_features: desiredFeatures,
      avoid,
      difficulty: difficulty === 'any' ? null : difficulty
    });
  };

  const toggleArrayItem = (array: string[], item: string, setter: (arr: string[]) => void) => {
    if (array.includes(item)) {
      setter(array.filter(i => i !== item));
    } else {
      setter([...array, item]);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-paper border-2 border-line p-6"
      style={{ borderRadius: '4px 8px 6px 10px' }}>

      <h2 className="font-handwritten text-3xl font-bold text-ink mb-6">
        Find Your Perfect Hike
      </h2>

      {/* Date */}
      <div>
        <label htmlFor="date" className="block font-handwritten text-lg font-bold text-ink mb-2">
          When?
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

      {/* Max Distance */}
      <div>
        <Slider
          label="Max distance"
          value={maxDistance}
          onChange={setMaxDistance}
          min={0}
          max={30}
          step={1}
          unit="miles"
        />
      </div>

      {/* Max Elevation Gain */}
      <div>
        <Slider
          label="Max elevation gain"
          value={maxElevation}
          onChange={setMaxElevation}
          min={0}
          max={8000}
          step={100}
          unit="ft"
        />
      </div>

      {/* Max Drive Time */}
      <div>
        <Slider
          label="Max drive time"
          value={maxDriveTime}
          onChange={setMaxDriveTime}
          min={0}
          max={360}
          step={15}
          unit="min"
        />
      </div>

      {/* Terrain Preferences */}
      <div>
        <h3 className="font-handwritten text-lg font-bold text-ink mb-3">
          What kind of terrain?
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {TERRAIN_OPTIONS.map(option => (
            <Checkbox
              key={option.id}
              id={`terrain-${option.id}`}
              label={option.label}
              checked={terrainPreferences.includes(option.id)}
              onChange={() => toggleArrayItem(terrainPreferences, option.id, setTerrainPreferences)}
            />
          ))}
        </div>
      </div>

      {/* Desired Features */}
      <div>
        <h3 className="font-handwritten text-lg font-bold text-ink mb-3">
          What features do you want?
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {FEATURE_OPTIONS.map(option => (
            <Checkbox
              key={option.id}
              id={`feature-${option.id}`}
              label={option.label}
              checked={desiredFeatures.includes(option.id)}
              onChange={() => toggleArrayItem(desiredFeatures, option.id, setDesiredFeatures)}
            />
          ))}
        </div>
      </div>

      {/* Avoid */}
      <div>
        <h3 className="font-handwritten text-lg font-bold text-ink mb-3">
          Avoid
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {AVOID_OPTIONS.map(option => (
            <Checkbox
              key={option.id}
              id={`avoid-${option.id}`}
              label={option.label}
              checked={avoid.includes(option.id)}
              onChange={() => toggleArrayItem(avoid, option.id, setAvoid)}
            />
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div>
        <label htmlFor="difficulty" className="block font-handwritten text-lg font-bold text-ink mb-2">
          Difficulty preference
        </label>
        <select
          id="difficulty"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="w-full px-4 py-2 bg-paper border-2 border-line font-body text-ink focus:border-ink-accent focus:outline-none transition-colors"
          style={{ borderRadius: '4px 8px 6px 10px' }}
        >
          <option value="any">Any</option>
          <option value="easy">Easy</option>
          <option value="moderate">Moderate</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4">
        <Button type="submit" variant="primary" disabled={isLoading}>
          {isLoading ? 'Finding Hikes...' : 'Find Hikes'}
        </Button>
      </div>
    </form>
  );
};

export default RecommendationForm;
