import axios from 'axios';
import type {
  User,
  UserProfile,
  Trail,
  TrailCondition,
  WeatherForecast,
  Assessment,
  Recommendation,
  HikeLog,
  OnboardingData,
  TrailFilters,
  RecommendationConstraints,
  CreateAssessmentRequest,
  CreateHikeRequest,
} from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: User; token: string }>('/api/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    api.post<{ user: User; token: string }>('/api/auth/register', { email, password, name }),
  me: () => api.get<{ user: User }>('/api/auth/me'),
};

export const profileApi = {
  get: () => api.get<User>('/api/profile'),
  update: (data: Partial<UserProfile>) => api.put<User>('/api/profile', data),
  onboard: (data: OnboardingData) => api.post<User>('/api/profile/onboard', data),
  updateGear: (gear_inventory: string[]) =>
    api.put<{ gear_inventory: string[] }>('/api/profile/gear', { gear_inventory }),
};

export const trailsApi = {
  list: (params?: TrailFilters) =>
    api.get<{ trails: Trail[]; count: number }>('/api/trails', { params }),
  get: (id: string) => api.get<Trail>(`/api/trails/${id}`),
  getConditions: (id: string) =>
    api.get<{ conditions: TrailCondition[]; latest: TrailCondition | null }>(
      `/api/trails/${id}/conditions`
    ),
  getWeather: (id: string, date: string) =>
    api.get<{ trailhead: WeatherForecast[]; summit: WeatherForecast[] }>(
      `/api/trails/${id}/weather`,
      { params: { date } }
    ),
};

export const assessmentApi = {
  create: (data: CreateAssessmentRequest) => api.post<Assessment>('/api/assessments', data),
  get: (id: string) => api.get<Assessment>(`/api/assessments/${id}`),
  list: () => api.get<{ assessments: Assessment[] }>('/api/assessments'),
};

export const recommendationApi = {
  get: (constraints: RecommendationConstraints) =>
    api.post<{ recommendations: Recommendation[]; message: string | null }>(
      '/api/recommendations',
      constraints
    ),
};

export const hikesApi = {
  list: () => api.get<{ hikes: HikeLog[] }>('/api/hikes'),
  create: (data: CreateHikeRequest) => api.post<{ hike: HikeLog }>('/api/hikes', data),
  update: (id: string, data: Partial<CreateHikeRequest>) =>
    api.put<HikeLog>(`/api/hikes/${id}`, data),
  delete: (id: string) => api.delete<{ success: boolean }>(`/api/hikes/${id}`),
};

export default api;
