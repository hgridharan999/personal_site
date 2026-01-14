import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Container } from '../components/layout/Container';
import RecommendationForm from '../components/recommendation/RecommendationForm';
import RecommendationList from '../components/recommendation/RecommendationList';
import type { RecommendationConstraints } from '../components/recommendation/RecommendationForm';
import { recommendationApi } from '../services/api';
import { Loader2 } from 'lucide-react';

export const RecommendPage = () => {
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const recommendationMutation = useMutation({
    mutationFn: (constraints: RecommendationConstraints) =>
      recommendationApi.get(constraints),
    onSuccess: (response) => {
      setRecommendations(response.data.recommendations);
      setMessage(response.data.message);
      setHasSearched(true);
    },
    onError: (error: any) => {
      console.error('Failed to get recommendations:', error);
      alert('Failed to get recommendations. Please try again.');
    }
  });

  const handleSubmit = (constraints: RecommendationConstraints) => {
    recommendationMutation.mutate(constraints);
  };

  return (
    <Container size="xl">
      <div className="py-8 space-y-8">
        {/* Form */}
        <RecommendationForm
          onSubmit={handleSubmit}
          isLoading={recommendationMutation.isPending}
        />

        {/* Loading State */}
        {recommendationMutation.isPending && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-highlight animate-spin" />
            <span className="ml-3 font-handwritten text-xl text-ink">
              Finding perfect hikes for you...
            </span>
          </div>
        )}

        {/* Results */}
        {hasSearched && !recommendationMutation.isPending && (
          <RecommendationList
            recommendations={recommendations}
            message={message}
          />
        )}
      </div>
    </Container>
  );
};
