import { useState, useEffect } from 'react';
import Checkbox from '../ui/Checkbox';

interface GearChecklistProps {
  selectedGear: string[];
  onChange: (gear: string[]) => void;
}

const GEAR_OPTIONS = [
  { id: 'trekking_poles', label: 'Trekking poles' },
  { id: 'microspikes', label: 'Microspikes/Yaktrax' },
  { id: 'crampons', label: 'Crampons' },
  { id: 'ice_axe', label: 'Ice axe' },
  { id: 'gps', label: 'GPS device/InReach' },
  { id: 'emergency_bivy', label: 'Emergency bivy/shelter' },
  { id: 'insulated_jacket', label: 'Insulated jacket' },
  { id: 'rain_jacket', label: 'Rain jacket' },
  { id: 'rain_pants', label: 'Rain pants' },
  { id: 'headlamp', label: 'Headlamp' },
  { id: 'first_aid', label: 'First aid kit' },
  { id: 'bear_spray', label: 'Bear spray' }
];

const GearChecklist = ({ selectedGear, onChange }: GearChecklistProps) => {
  const [gear, setGear] = useState<string[]>(selectedGear);

  useEffect(() => {
    setGear(selectedGear);
  }, [selectedGear]);

  const handleToggle = (gearId: string) => {
    const newGear = gear.includes(gearId)
      ? gear.filter(g => g !== gearId)
      : [...gear, gearId];
    setGear(newGear);
    onChange(newGear);
  };

  return (
    <div className="space-y-2">
      <h4 className="font-handwritten text-lg font-bold text-ink mb-3">
        What gear are you bringing?
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {GEAR_OPTIONS.map(option => (
          <Checkbox
            key={option.id}
            id={option.id}
            label={option.label}
            checked={gear.includes(option.id)}
            onChange={() => handleToggle(option.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default GearChecklist;
