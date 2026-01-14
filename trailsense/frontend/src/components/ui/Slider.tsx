import React from 'react';

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
}) => {
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <label className="font-handwritten text-lg text-ink">{label}</label>
        <span className="font-notes text-ink-accent">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-line rounded-full appearance-none cursor-pointer accent-highlight"
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs font-notes text-fade">
          {min}
          {unit}
        </span>
        <span className="text-xs font-notes text-fade">
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
};
