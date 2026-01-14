import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../components/layout/Container';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Mountain } from 'lucide-react';

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Container size="md">
      <div className="text-center mb-8">
        <Mountain className="w-16 h-16 text-highlight mx-auto mb-4" />
        <h1 className="font-handwritten text-5xl font-bold text-ink mb-2">
          Welcome to TrailSense!
        </h1>
        <p className="font-body text-lg text-ink/70">
          Let's set up your profile so we can give you personalized recommendations.
        </p>
      </div>

      <Card>
        <div className="text-center py-12">
          <p className="font-body text-lg text-ink/70 mb-6">
            Onboarding form coming in Phase 4!
          </p>
          <p className="font-body text-base text-fade mb-6">
            For now, click below to skip to your dashboard.
          </p>
          <Button variant="primary" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </Button>
        </div>
      </Card>
    </Container>
  );
};
