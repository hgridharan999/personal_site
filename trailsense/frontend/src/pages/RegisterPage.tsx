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

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export const RegisterPage: React.FC = () => {
  const { register: registerUser, isRegistering, registerError } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = (data: RegisterForm) => {
    registerUser({ email: data.email, password: data.password, name: data.name });
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <Container size="sm">
        <div className="text-center mb-8">
          <Mountain className="w-16 h-16 text-highlight mx-auto mb-4" />
          <h1 className="font-handwritten text-5xl font-bold text-ink mb-2">Get Started</h1>
          <p className="font-body text-lg text-ink/70">
            Create an account to start planning safer hikes
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {registerError && (
              <div className="p-4 bg-red-50 border-2 border-red-300 irregular-border">
                <p className="font-body text-sm text-red-700">
                  {registerError instanceof Error
                    ? registerError.message
                    : 'Registration failed. Please try again.'}
                </p>
              </div>
            )}

            <Input
              label="Name"
              type="text"
              placeholder="Your name"
              error={errors.name?.message}
              {...register('name')}
            />

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

            <Input
              label="Confirm Password"
              type="password"
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button type="submit" variant="primary" className="w-full" isLoading={isRegistering}>
              Create Account
            </Button>

            <div className="text-center">
              <p className="font-body text-sm text-ink/70">
                Already have an account?{' '}
                <Link to="/login" className="text-ink-accent hover:text-highlight font-bold">
                  Log in
                </Link>
              </p>
            </div>
          </form>
        </Card>
      </Container>
    </div>
  );
};
