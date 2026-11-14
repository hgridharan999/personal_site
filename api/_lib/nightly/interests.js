// Fields far from the usual ground, for the nightly niche item.
export const FIELDS = [
  'materials science', 'linguistics', 'archaeology', 'mycology', 'maritime shipping',
  'epidemiology', 'typography', 'soil science', 'astronomy', 'urban planning',
  'music theory', 'insurance', 'cartography', 'beekeeping', 'glassmaking',
  'paleontology', 'oceanography', 'ornithology', 'metallurgy', 'textile history',
  'horology', 'seismology', 'forestry', 'architectural history', 'acoustics',
  'ceramics', 'volcanology', 'fermentation science', 'sleep science', 'bridge engineering',
  'hydrology',
];

// Areas to avoid; passed to the prompt so the model steers clear.
export const USUAL_GROUND = [
  'business', 'tech', 'startups', 'venture capital', 'climate',
  'consulting', 'hiking', 'mountains', 'poker',
];
