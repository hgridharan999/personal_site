import { Navigate, useLocation } from 'react-router-dom';
import PrivateShell from './PrivateShell';
import { useSession } from './useSession';

/**
 * Client-side gate for private routes. This is UX only — anything genuinely
 * sensitive must be served from an /api route that calls verifySession().
 */
export default function RequireAuth({ children }) {
  const { status, logout, refresh } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <PrivateShell className="prv-center">
        <span className="asc-mono prv-status" role="status">Checking session…</span>
      </PrivateShell>
    );
  }

  if (status === 'error') {
    return (
      <PrivateShell className="prv-center">
        <div className="prv-status" role="alert">
          <span className="asc-mono">Could not reach the server.</span>
          <button type="button" data-hot className="asc-mono prv-logout" onClick={refresh}>Retry</button>
        </div>
      </PrivateShell>
    );
  }

  if (status === 'anon') return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return children({ logout });
}
