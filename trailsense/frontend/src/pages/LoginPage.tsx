import React from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Container } from '../components/layout/Container';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { Mountain } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const { login, isLoggingIn, loginError } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginForm) => {
    login(data);
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <Container size="sm">
        <div className="text-center mb-8">
          <Mountain className="w-16 h-16 text-highlight mx-auto mb-4" />
          <h1 className="font-handwritten text-5xl font-bold text-ink mb-2">Welcome Back</h1>
          <p className="font-body text-lg text-ink/70">Log in to continue your hiking journey</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {loginError && (
              <div className="p-4 bg-red-50 border-2 border-red-300 irregular-border">
                <p className="font-body text-sm text-red-700">
                  {loginError instanceof Error ? loginError.message : 'Login failed. Please try again.'}
                </p>
              </div>
            )}

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />

            <Button type="submit" variant="primary" className="w-full" isLoading={isLoggingIn}>
              Log In
            </Button>

            <div className="text-center">
              <p className="font-body text-sm text-ink/70">
                Don't have an account?{' '}
                <Link to="/register" className="text-ink-accent hover:text-highlight font-bold">
                  Sign up
                </Link>
              </p>
            </div>
          </form>
        </Card>
      </Container>
    </div>
  );
};
