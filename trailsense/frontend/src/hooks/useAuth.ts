import { useMutation, useQuery } from '@tanstack/react-query';
import { authApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

export function useAuth() {
  const { user, isAuthenticated, setAuth, logout: logoutStore } = useAuthStore();
  const navigate = useNavigate();

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (response) => {
      setAuth(response.data.user, response.data.token);
      navigate('/dashboard');
    },
  });

  const registerMutation = useMutation({
    mutationFn: ({
      email,
      password,
      name,
    }: {
      email: string;
      password: string;
      name: string;
    }) => authApi.register(email, password, name),
    onSuccess: (response) => {
      setAuth(response.data.user, response.data.token);
      navigate('/onboarding');
    },
  });

  const logout = () => {
    logoutStore();
    navigate('/');
  };

  return {
    user,
    isAuthenticated,
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
  };
}
