/**
 * FilterPanel Component
 * Vertical filters and search options
 */

import { useState } from 'react';
import { Filter, X } from 'lucide-react';

const VERTICALS = [
  { id: 'carbon_management', name: 'Carbon Management' },
  { id: 'clean_energy', name: 'Clean Energy' },
  { id: 'energy_storage', name: 'Energy Storage' },
  { id: 'green_transportation', name: 'Green Transportation' },
  { id: 'sustainable_agriculture', name: 'Sustainable Agriculture' },
  { id: 'built_environment', name: 'Built Environment' },
  { id: 'circular_economy', name: 'Circular Economy' },
  { id: 'climate_fintech', name: 'Climate Fintech' },
  { id: 'water_ocean', name: 'Water & Ocean' },
  { id: 'industrial_decarbonization', name: 'Industrial Decarbonization' },
  { id: 'climate_adaptation', name: 'Climate Adaptation' },
  { id: 'grid_energy_management', name: 'Grid & Energy Management' },
];

export default function FilterPanel({ filters, onFiltersChange }) {
  const [selectedVertical, setSelectedVertical] = useState(filters.vertical_filter || null);
  const [yearMin, setYearMin] = useState(filters.founded_year_min || '');
  const [yearMax, setYearMax] = useState(filters.founded_year_max || '');

  const handleVerticalClick = (verticalId) => {
    const next = selectedVertical === verticalId ? null : verticalId;
    setSelectedVertical(next);
    onFiltersChange({
      vertical_filter: next,
      founded_year_min: yearMin ? parseInt(yearMin) : undefined,
      founded_year_max: yearMax ? parseInt(yearMax) : undefined,
    });
  };

  const handleYearMinChange = (e) => {
    const val = e.target.value;
    setYearMin(val);
    onFiltersChange({
      vertical_filter: selectedVertical,
      founded_year_min: val ? parseInt(val) : undefined,
      founded_year_max: yearMax ? parseInt(yearMax) : undefined,
    });
  };

  const handleYearMaxChange = (e) => {
    const val = e.target.value;
    setYearMax(val);
    onFiltersChange({
      vertical_filter: selectedVertical,
      founded_year_min: yearMin ? parseInt(yearMin) : undefined,
      founded_year_max: val ? parseInt(val) : undefined,
    });
  };

  const handleClearFilters = () => {
    setSelectedVertical(null);
    setYearMin('');
    setYearMax('');
    onFiltersChange({ vertical_filter: null, founded_year_min: undefined, founded_year_max: undefined });
  };

  const hasActiveFilters = selectedVertical || yearMin || yearMax;

  return (
    <div className="
      bg-paper/50 p-6 rounded-sm border-2 border-line
      shadow-page
      sticky top-6
    ">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl md:text-2xl font-handwritten font-bold text-ink flex items-center gap-2">
          <Filter className="w-5 h-5" />
          Filters
        </h3>
        
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-sm font-notes text-fade hover:text-ink transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Vertical Filters */}
      <div className="mb-6">
        <h4 className="text-lg font-handwritten font-semibold text-ink mb-3">
          Climate Verticals
        </h4>
        <div className="flex flex-wrap gap-2">
          {VERTICALS.map((vertical) => (
            <button
              key={vertical.id}
              onClick={() => handleVerticalClick(vertical.id)}
              className={`
                px-3 py-1.5 text-sm
                border-2 rounded-full
                font-notes
                transition-all duration-200
                transform hover:scale-105
                ${
                  selectedVertical === vertical.id
                    ? 'bg-ink-accent text-paper border-ink-accent'
                    : 'bg-paper text-ink-accent border-ink-accent hover:bg-ink-accent/10'
                }
              `}
            >
              {vertical.name}
            </button>
          ))}
        </div>
      </div>

      {/* Year Range */}
      <div className="mb-4">
        <h4 className="text-lg font-handwritten font-semibold text-ink mb-3">
          Founded Year
        </h4>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-notes text-fade mb-1">
              From
            </label>
            <input
              type="number"
              value={yearMin}
              onChange={handleYearMinChange}
              placeholder="2000"
              min="1900"
              max={new Date().getFullYear()}
              className="
                w-full px-3 py-2
                bg-paper border-2 border-line rounded-sm
                font-body text-sm text-ink
                placeholder:text-fade
                focus:outline-none focus:border-ink-accent
                transition-colors
              "
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-notes text-fade mb-1">
              To
            </label>
            <input
              type="number"
              value={yearMax}
              onChange={handleYearMaxChange}
              placeholder={new Date().getFullYear().toString()}
              min="1900"
              max={new Date().getFullYear()}
              className="
                w-full px-3 py-2
                bg-paper border-2 border-line rounded-sm
                font-body text-sm text-ink
                placeholder:text-fade
                focus:outline-none focus:border-ink-accent
                transition-colors
              "
            />
          </div>
        </div>
      </div>

    </div>
  );
}
