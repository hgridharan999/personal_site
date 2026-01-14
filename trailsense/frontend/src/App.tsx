import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { TrailsPage } from './pages/TrailsPage';
import { TrailDetailPage } from './pages/TrailDetailPage';
import { RecommendPage } from './pages/RecommendPage';
import { MyHikesPage } from './pages/MyHikesPage';
import { ProfilePage } from './pages/ProfilePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout><HomePage /></AppLayout>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <AppLayout><OnboardingPage /></AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppLayout><DashboardPage /></AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/trails"
            element={
              <ProtectedRoute>
                <AppLayout><TrailsPage /></AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/trails/:id"
            element={
              <ProtectedRoute>
                <AppLayout><TrailDetailPage /></AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/recommend"
            element={
              <ProtectedRoute>
                <AppLayout><RecommendPage /></AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/my-hikes"
            element={
              <ProtectedRoute>
                <AppLayout><MyHikesPage /></AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AppLayout><ProfilePage /></AppLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
