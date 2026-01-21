/**
 * StatsPanel Component
 * Display search statistics and database info
 */

import { useState, useEffect } from 'react';
import { BarChart3, Database, Clock } from 'lucide-react';
import { getStats } from '../../utils/climateApi';

export default function StatsPanel() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const data = await getStats();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="bg-paper/50 p-6 rounded-sm border-2 border-line shadow-page animate-pulse">
        <div className="h-6 bg-line rounded w-3/4 mb-4"></div>
        <div className="space-y-2">
          <div className="h-4 bg-line rounded"></div>
          <div className="h-4 bg-line rounded w-5/6"></div>
          <div className="h-4 bg-line rounded w-4/6"></div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const topVerticals = Object.entries(stats.verticals || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="
      bg-paper/50 p-6 rounded-sm border-2 border-line
      shadow-page
      sticky top-6
    ">
      {/* Header */}
      <h3 className="text-xl md:text-2xl font-handwritten font-bold text-ink mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5" />
        Database Stats
      </h3>

      {/* Total Startups */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-ink-accent" />
          <span className="font-notes text-sm text-fade">Total Startups</span>
        </div>
        <p className="text-3xl font-handwritten font-bold text-ink">
          {stats.total_startups?.toLocaleString()}
        </p>
      </div>

      {/* Top Verticals */}
      {topVerticals.length > 0 && (
        <div className="mb-6">
          <h4 className="font-notes text-sm text-fade mb-3">Top Verticals</h4>
          <div className="space-y-2">
            {topVerticals.map(([vertical, count]) => {
              const percentage = ((count / stats.total_startups) * 100).toFixed(1);
              return (
                <div key={vertical} className="relative">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-body text-xs text-ink">
                      {vertical.replace(/_/g, ' ')}
                    </span>
                    <span className="font-notes text-xs text-fade">
                      {count}
                    </span>
                  </div>
                  <div className="h-2 bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full bg-ink-accent rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Last Updated */}
      {stats.last_updated && (
        <div className="flex items-center gap-2 text-xs font-notes text-fade">
          <Clock className="w-3 h-3" />
          <span>Updated {stats.last_updated}</span>
        </div>
      )}

      {/* Decorative ink splatter */}
      <div className="absolute top-4 right-4 w-2 h-2 bg-ink/10 rounded-full opacity-30"></div>
    </div>
  );
}
