import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Container } from '../components/layout/Container';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import AssessmentModal from '../components/assessment/AssessmentModal';
import AssessmentResult from '../components/assessment/AssessmentResult';
import { useTrail, useTrailConditions } from '../hooks/useTrails';
import { useAuthStore } from '../stores/authStore';
import { assessmentApi, hikesApi } from '../services/api';
import { MapPin, TrendingUp, Clock, Loader2 } from 'lucide-react';

export const TrailDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: trail, isLoading } = useTrail(id!);
  const { data: conditions } = useTrailConditions(id!);
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<any>(null);

  const assessmentMutation = useMutation({
    mutationFn: (data: { trail_id: string; date: string; gear: string[] }) =>
      assessmentApi.create(data),
    onSuccess: (response) => {
      setAssessmentResult(response.data);
      setShowAssessmentModal(false);
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
    onError: (error: any) => {
      console.error('Failed to create assessment:', error);
      alert('Failed to create assessment. Please try again.');
    }
  });

  const saveHikeMutation = useMutation({
    mutationFn: () => hikesApi.create({
      trail_id: id!,
      trail_name: trail?.name || '',
      hike_date: assessmentResult?.assessment_date || new Date().toISOString().split('T')[0],
      completed: false,
      difficulty_rating: 3,
      time_taken_hours: trail?.estimated_time_hours || 0,
      notes: ''
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hikes'] });
      alert('Trail saved to your hikes!');
    },
    onError: (error: any) => {
      console.error('Failed to save hike:', error);
      alert('Failed to save hike. Please try again.');
    }
  });

  const handleAssessHike = (data: { date: string; gear: string[] }) => {
    if (!id) return;
    assessmentMutation.mutate({
      trail_id: id,
      date: data.date,
      gear: data.gear
    });
  };

  const handleSaveHike = () => {
    saveHikeMutation.mutate();
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

  if (!trail) {
    return (
      <Container>
        <p className="text-center py-12 font-body text-ink/70">Trail not found.</p>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mb-6">
        <h1 className="font-handwritten text-5xl font-bold text-ink mb-4">{trail.name}</h1>
        <div className="flex items-center gap-4">
          <Badge
            variant={
              trail.difficulty === 'easy'
                ? 'success'
                : trail.difficulty === 'moderate'
                ? 'warning'
                : 'error'
            }
          >
            {trail.difficulty}
          </Badge>
          {trail.region && <span className="font-body text-ink/70">{trail.region}</span>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Card>
          <div className="flex items-center gap-3">
            <MapPin className="w-6 h-6 text-highlight" />
            <div>
              <p className="font-notes text-sm text-fade">Distance</p>
              <p className="font-handwritten text-xl text-ink">{trail.distance_miles} miles</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-highlight" />
            <div>
              <p className="font-notes text-sm text-fade">Elevation Gain</p>
              <p className="font-handwritten text-xl text-ink">{trail.elevation_gain_ft} ft</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-highlight" />
            <div>
              <p className="font-notes text-sm text-fade">Estimated Time</p>
              <p className="font-handwritten text-xl text-ink">
                {trail.estimated_time_hours} hours
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mb-8">
        <h2 className="font-handwritten text-3xl font-bold text-ink mb-4">Route Description</h2>
        <p className="font-body text-base text-ink/80 leading-relaxed">
          {trail.route_description || 'No description available.'}
        </p>
      </Card>

      {conditions?.latest && (
        <Card className="mb-8">
          <h2 className="font-handwritten text-3xl font-bold text-ink mb-4">Latest Conditions</h2>
          <div className="space-y-2">
            <p className="font-body text-base text-ink/80">
              <span className="font-bold">Status:</span> {conditions.latest.trail_status}
            </p>
            <p className="font-body text-sm text-fade">
              Reported {new Date(conditions.latest.report_date).toLocaleDateString()}
            </p>
          </div>
        </Card>
      )}

      {/* Assessment Result */}
      {assessmentResult && (
        <div className="mb-8">
          <AssessmentResult
            assessment={assessmentResult}
            onClose={() => setAssessmentResult(null)}
            onSave={handleSaveHike}
          />
        </div>
      )}

      {/* Action Buttons */}
      {!assessmentResult && (
        <div className="flex gap-4">
          <Button
            variant="primary"
            onClick={() => setShowAssessmentModal(true)}
          >
            Assess This Hike
          </Button>
          <Button
            variant="secondary"
            onClick={handleSaveHike}
            disabled={saveHikeMutation.isPending}
          >
            {saveHikeMutation.isPending ? 'Saving...' : 'Save to My Hikes'}
          </Button>
        </div>
      )}

      {/* Assessment Modal */}
      {showAssessmentModal && (
        <AssessmentModal
          trailId={id!}
          onClose={() => setShowAssessmentModal(false)}
          onSubmit={handleAssessHike}
          isLoading={assessmentMutation.isPending}
          initialGear={user?.gear_inventory || []}
        />
      )}
    </Container>
  );
};
