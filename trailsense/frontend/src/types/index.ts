export interface User {
  id: string;
  email: string;
  name: string | null;
  profile: UserProfile;
  gear_inventory: string[];
  current_fatigue: number;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  fitness: {
    max_hours: number;
    max_elevation_gain: number;
    pace: 'slow' | 'moderate' | 'fast';
    experience_years: number;
  };
  technical: {
    scrambling_comfort: boolean;
    exposure_comfort: number;
    navigation_skill: 'yes' | 'no' | 'sometimes';
  };
  personal: {
    home_elevation: number;
    cold_tolerance: number;
    risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
  };
  location: {
    city: string;
    state: string;
    lat: number;
    lon: number;
  };
}

export interface Trail {
  id: string;
  name: string;
  region: string | null;
  trailhead_lat: number;
  trailhead_lon: number;
  trailhead_elevation: number;
  highest_point_elevation: number;
  distance_miles: number;
  elevation_gain_ft: number;
  trail_type: 'loop' | 'out-and-back' | 'point-to-point';
  difficulty: 'easy' | 'moderate' | 'hard' | 'very-hard';
  technical_class: number;
  exposure_level: number;
  terrain_types: string[];
  features: string[];
  typical_crowd_level: number;
  dogs_allowed: boolean;
  fee_required: boolean;
  best_months: number[];
  estimated_time_hours: number;
  route_description: string | null;
  required_gear: string[];
  photos: string[];
  created_at: string;
  updated_at: string;
}

export interface TrailCondition {
  id: string;
  trail_id: string;
  report_date: string;
  snow_level_ft: number | null;
  trail_status: 'clear' | 'muddy' | 'icy' | 'snowy' | 'closed' | null;
  mud_level: 'none' | 'light' | 'moderate' | 'heavy' | null;
  water_crossing_status: 'low' | 'moderate' | 'high' | 'impassable' | null;
  hazards: string[];
  required_gear: string[];
  difficulty_sentiment: 'easier' | 'as-expected' | 'harder' | null;
  overall_sentiment: 'positive' | 'neutral' | 'negative';
  source: string;
  source_url: string | null;
  raw_text: string | null;
  confidence: number;
  created_at: string;
}

export interface WeatherForecast {
  id: string;
  trail_id: string;
  location_type: 'trailhead' | 'summit';
  forecast_date: string;
  forecast_hour: number;
  temperature_f: number;
  precipitation_prob: number;
  precipitation_type: 'rain' | 'snow' | null;
  wind_speed_mph: number;
  wind_gust_mph: number;
  sky_cover: number;
  weather_summary: string;
  fetched_at: string;
}

export interface Assessment {
  assessment_id: string;
  confidence_score: number;
  recommendation: 'go' | 'caution' | 'reconsider' | 'dont-go';
  breakdown: {
    capability: {
      status: 'good' | 'warning' | 'bad';
      notes: string;
    };
    weather: {
      status: 'good' | 'warning' | 'bad';
      notes: string;
    };
    conditions: {
      status: 'good' | 'warning' | 'bad';
      notes: string;
    };
    gear: {
      status: 'good' | 'warning' | 'bad';
      notes: string;
    };
  };
  concerns: string[];
  estimated_time_hours: number;
  weather_summary: WeatherSummary;
  recent_reports: TrailCondition[];
}

export interface WeatherSummary {
  trailhead: {
    temp_min: number;
    temp_max: number;
    conditions: string;
  };
  summit: {
    temp_min: number;
    temp_max: number;
    conditions: string;
  };
}

export interface Recommendation {
  trail: Trail;
  confidence_score: number;
  drive_time_minutes: number;
  why_recommended: string;
  concerns: string[];
  weather_summary: WeatherSummary;
}

export interface HikeLog {
  id: string;
  user_id: string;
  trail_id: string | null;
  trail_name: string;
  hike_date: string;
  completed: boolean;
  difficulty_rating: number;
  time_taken_hours: number;
  notes: string | null;
  created_at: string;
}

export interface OnboardingData {
  fitness: UserProfile['fitness'];
  technical: UserProfile['technical'];
  personal: UserProfile['personal'];
  location: UserProfile['location'];
  gear_inventory: string[];
}

export interface TrailFilters {
  search?: string;
  difficulty?: string;
  max_distance?: number;
  max_elevation?: number;
  limit?: number;
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

export interface CreateAssessmentRequest {
  trail_id: string;
  date: string;
  gear: string[];
}

export interface CreateHikeRequest {
  trail_id: string;
  hike_date: string;
  completed: boolean;
  difficulty_rating: number;
  time_taken_hours: number;
  notes: string;
}
