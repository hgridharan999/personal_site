import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import PrivateShell from './PrivateShell';
import { useSession } from './useSession';

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
    <PrivateShell className="prv-center">
      <Link to="/" data-hot className="asc-back asc-mono prv-corner">
        <ArrowLeft size={14} /> <span className="b-name">Hari Gridharan</span>
      </Link>

      <form className="prv-login" onSubmit={onSubmit} noValidate>
        <span className="asc-mono" style={{ color: 'var(--faint)' }}>Base camp</span>
        <h1 className="asc-h prv-title">
          <span className="asc-serif-it asc-amber" style={{ fontWeight: 400 }}>Sign</span> in
        </h1>

        <label htmlFor="prv-password" className="asc-mono prv-label">Password</label>
        <div className="prv-field">
          <input
            id="prv-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'prv-error' : undefined}
          />
          <button type="submit" data-hot aria-label="Sign in" disabled={!password || submitting}>
            <ArrowRight size={18} />
          </button>
        </div>

        <p id="prv-error" role="alert" className="prv-error">
          {error || (status === 'error' ? 'Could not reach the server.' : '')}
        </p>
      </form>
    </PrivateShell>
  );
}
