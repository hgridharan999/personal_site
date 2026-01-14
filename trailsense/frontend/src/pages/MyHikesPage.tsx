import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Container } from '../components/layout/Container';
import { Card } from '../components/ui/Card';
import Button from '../components/ui/Button';
import HikeLogForm from '../components/hike/HikeLogForm';
import HikeLogCard from '../components/hike/HikeLogCard';
import type { HikeLogData } from '../components/hike/HikeLogForm';
import { hikesApi, assessmentApi } from '../services/api';
import { Mountain, Plus, Loader2, TrendingUp, Clock, Award } from 'lucide-react';

export const MyHikesPage = () => {
  const [showLogForm, setShowLogForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: hikesData, isLoading } = useQuery({
    queryKey: ['hikes'],
    queryFn: () => hikesApi.list()
  });

  const { data: assessmentsData } = useQuery({
    queryKey: ['assessments'],
    queryFn: () => assessmentApi.list()
  });

  const createHikeMutation = useMutation({
    mutationFn: (data: HikeLogData) => hikesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hikes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setShowLogForm(false);
    },
    onError: (error: any) => {
      console.error('Failed to log hike:', error);
      alert('Failed to log hike. Please try again.');
    }
  });

  const deleteHikeMutation = useMutation({
    mutationFn: (id: string) => hikesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hikes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error: any) => {
      console.error('Failed to delete hike:', error);
      alert('Failed to delete hike. Please try again.');
    }
  });

  const hikes = hikesData?.data.hikes || [];
  const assessedTrails = assessmentsData?.data.assessments.map((a: any) => ({
    id: a.trail_id,
    name: a.trail_name || 'Unknown Trail'
  })) || [];

  const calculateStats = () => {
    if (hikes.length === 0) return null;

    const totalHikes = hikes.length;
    const completedHikes = hikes.filter((h: any) => h.completed).length;
    const totalTime = hikes.reduce((sum: number, h: any) => sum + (h.time_taken_hours || 0), 0);
    const avgDifficulty = hikes.reduce((sum: number, h: any) => sum + h.difficulty_rating, 0) / totalHikes;

    return { totalHikes, completedHikes, totalTime, avgDifficulty };
  };

  const stats = calculateStats();

  const handleLogHike = (data: HikeLogData) => {
    createHikeMutation.mutate(data);
  };

  const handleDeleteHike = (id: string) => {
    if (confirm('Are you sure you want to delete this hike log?')) {
      deleteHikeMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <Container>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-highlight animate-spin" />
        </div>
      </Container>
    );
  }

  return (
    <Container size="lg">
      <div className="py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-handwritten text-5xl font-bold text-ink mb-2">
              My Hikes
            </h1>
            <p className="font-body text-lg text-ink/70">
              Track your completed hikes and see how you've improved
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowLogForm(true)}
          >
            <Plus className="w-5 h-5 mr-2" />
            Log New Hike
          </Button>
        </div>

        {/* Stats Summary */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <div className="flex items-center gap-3">
                <Mountain className="w-8 h-8 text-highlight" />
                <div>
                  <p className="font-notes text-sm text-ink/60">Total Hikes</p>
                  <p className="font-handwritten text-3xl font-bold text-ink">
                    {stats.totalHikes}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <Award className="w-8 h-8 text-green-600" />
                <div>
                  <p className="font-notes text-sm text-ink/60">Completed</p>
                  <p className="font-handwritten text-3xl font-bold text-ink">
                    {stats.completedHikes}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <Clock className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="font-notes text-sm text-ink/60">Total Time</p>
                  <p className="font-handwritten text-3xl font-bold text-ink">
                    {stats.totalTime.toFixed(1)}h
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-yellow-600" />
                <div>
                  <p className="font-notes text-sm text-ink/60">Avg Difficulty</p>
                  <p className="font-handwritten text-3xl font-bold text-ink">
                    {stats.avgDifficulty.toFixed(1)}/5
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Hike List */}
        {hikes.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <Mountain className="w-12 h-12 text-fade mx-auto mb-4" />
              <h3 className="font-handwritten text-2xl text-ink mb-2">
                No hikes logged yet
              </h3>
              <p className="font-body text-base text-fade mb-6">
                Start logging your hikes to track your progress and improve your fitness estimates!
              </p>
              <Button variant="primary" onClick={() => setShowLogForm(true)}>
                Log Your First Hike
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {hikes.map((hike: any) => (
              <HikeLogCard
                key={hike.id}
                hike={hike}
                onDelete={handleDeleteHike}
              />
            ))}
          </div>
        )}

        {/* Log Form Modal */}
        {showLogForm && (
          <HikeLogForm
            onClose={() => setShowLogForm(false)}
            onSubmit={handleLogHike}
            isLoading={createHikeMutation.isPending}
            trails={assessedTrails}
          />
        )}
      </div>
    </Container>
  );
};
