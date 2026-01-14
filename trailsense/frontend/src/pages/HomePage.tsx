import React from 'react';
import { Link } from 'react-router-dom';
import { Mountain, Target, Cloud, Brain } from 'lucide-react';
import { Container } from '../components/layout/Container';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export const HomePage: React.FC = () => {
  const features = [
    {
      icon: Target,
      title: 'Personalized Assessment',
      description: 'Get confidence scores based on your fitness, technical ability, and gear.',
    },
    {
      icon: Cloud,
      title: 'Weather Integration',
      description: 'Real-time forecasts with summit-specific conditions.',
    },
    {
      icon: Brain,
      title: 'Smart Recommendations',
      description: 'Find the perfect hike based on your constraints and preferences.',
    },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <Container>
        <div className="text-center py-16">
          <Mountain className="w-20 h-20 text-highlight mx-auto mb-6" />
          <h1 className="font-handwritten text-6xl md:text-7xl font-bold text-ink mb-6">
            TrailSense
          </h1>
          <p className="text-xl md:text-2xl font-body text-ink/80 max-w-3xl mx-auto mb-8">
            A personal hiking decision support system that helps you assess trail feasibility and
            find the perfect hike based on conditions and your capabilities.
          </p>
          <div className="flex gap-4 justify-center">
            <Link to="/register">
              <Button variant="primary">Get Started</Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary">Log In</Button>
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-16">
          {features.map((feature) => (
            <Card key={feature.title}>
              <div className="flex flex-col items-center text-center gap-4">
                <div className="p-3 bg-highlight/10 border border-highlight/30 rounded-full">
                  <feature.icon className="w-8 h-8 text-highlight" />
                </div>
                <h3 className="font-handwritten text-2xl font-bold text-ink">{feature.title}</h3>
                <p className="font-body text-base text-ink/80">{feature.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </Container>
    </div>
  );
};
