import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import SiteShell from '../site/SiteShell';
import { useSession } from './useSession';
import './login.css';

export default function LoginPage() {
  const { status, login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const next = location.state?.from || '/me';
  if (status === 'authed') return <Navigate to={next} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await login(password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteShell title="Sign in" noindex footer={false}>
      <form className="lg-form" onSubmit={onSubmit} noValidate>
        <label htmlFor="prv-password" className="lg-label">Password</label>
        <input
          id="prv-password"
          className="sp-input"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'prv-error' : undefined}
        />
        <button type="submit" className="btn btn-line" disabled={!password || submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p id="prv-error" role="alert" className="lg-error">
          {error || (status === 'error' ? 'Could not reach the server.' : '')}
        </p>
      </form>
    </SiteShell>
  );
}
