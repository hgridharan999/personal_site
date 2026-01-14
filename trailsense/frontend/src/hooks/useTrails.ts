import { useQuery } from '@tanstack/react-query';
import { trailsApi } from '../services/api';
import type { TrailFilters } from '../types';

export function useTrails(filters?: TrailFilters) {
  return useQuery({
    queryKey: ['trails', filters],
    queryFn: () => trailsApi.list(filters).then((r) => r.data),
  });
}

export function useTrail(id: string) {
  return useQuery({
    queryKey: ['trail', id],
    queryFn: () => trailsApi.get(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useTrailConditions(id: string) {
  return useQuery({
    queryKey: ['trail-conditions', id],
    queryFn: () => trailsApi.getConditions(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useTrailWeather(id: string, date: string) {
  return useQuery({
    queryKey: ['trail-weather', id, date],
    queryFn: () => trailsApi.getWeather(id, date).then((r) => r.data),
    enabled: !!id && !!date,
  });
}
