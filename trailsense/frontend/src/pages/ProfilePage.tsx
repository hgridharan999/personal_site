import React from 'react';
import { Container } from '../components/layout/Container';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/authStore';
import { User } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user } = useAuthStore();
  const { logout } = useAuth();

  return (
    <Container size="md">
      <h1 className="font-handwritten text-5xl font-bold text-ink mb-8">Profile</h1>

      <Card className="mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-highlight/20 border-2 border-highlight rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-highlight" />
          </div>
          <div>
            <h2 className="font-handwritten text-2xl font-bold text-ink">{user?.name}</h2>
            <p className="font-body text-base text-ink/70">{user?.email}</p>
          </div>
        </div>

        <div className="border-t-2 border-line pt-6">
          <p className="font-body text-base text-fade mb-4">
            Profile editing and gear management coming in Phase 4!
          </p>
        </div>
      </Card>

      <Button variant="secondary" onClick={logout}>
        Log Out
      </Button>
    </Container>
  );
};
