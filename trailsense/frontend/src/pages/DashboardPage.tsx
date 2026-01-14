import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/layout/Container';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuthStore } from '../stores/authStore';
import { Mountain, Search, Map } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();

  return (
    <Container>
      <div className="mb-8">
        <h1 className="font-handwritten text-5xl font-bold text-ink mb-4">
          Welcome back, {user?.name || 'Hiker'}!
        </h1>
        <p className="font-body text-lg text-ink/70">
          Ready to plan your next adventure?
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card hover>
          <Link to="/recommend" className="block">
            <div className="flex items-start gap-4">
              <Search className="w-10 h-10 text-highlight flex-shrink-0" />
              <div>
                <h3 className="font-handwritten text-2xl font-bold text-ink mb-2">
                  Find a Hike
                </h3>
                <p className="font-body text-base text-ink/70">
                  Get personalized trail recommendations based on your preferences and the current
                  conditions.
                </p>
                <Button variant="primary" className="mt-4">
                  Start Searching
                </Button>
              </div>
            </div>
          </Link>
        </Card>

        <Card hover>
          <Link to="/trails" className="block">
            <div className="flex items-start gap-4">
              <Map className="w-10 h-10 text-highlight flex-shrink-0" />
              <div>
                <h3 className="font-handwritten text-2xl font-bold text-ink mb-2">
                  Browse Trails
                </h3>
                <p className="font-body text-base text-ink/70">
                  Explore all available trails, search by name, and filter by difficulty and
                  distance.
                </p>
                <Button variant="primary" className="mt-4">
                  View Trails
                </Button>
              </div>
            </div>
          </Link>
        </Card>
      </div>

      <div className="mt-8">
        <Card>
          <div className="text-center py-8">
            <Mountain className="w-12 h-12 text-fade mx-auto mb-4" />
            <h3 className="font-handwritten text-2xl text-ink mb-2">
              No recent assessments yet
            </h3>
            <p className="font-body text-base text-fade">
              Start by finding a hike or browsing trails to get personalized recommendations.
            </p>
          </div>
        </Card>
      </div>
    </Container>
  );
};
