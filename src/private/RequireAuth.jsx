import { Navigate, useLocation } from 'react-router-dom';
import PrivateShell from './PrivateShell';
import SiteShell from '../site/SiteShell';
import { isLightPath } from '../site/lightRoutes';
import { useSession } from './useSession';
import './login.css';

/**
 * Client-side gate for private routes. This is UX only â€” anything genuinely
 * sensitive must be served from an /api route that calls verifySession().
 */
export default function RequireAuth({ children }) {
  const { status, logout, refresh } = useSession();
  const location = useLocation();

  const light = isLightPath(location.pathname);

  if (status === 'loading') {
    if (light) {
      return (
        <SiteShell docTitle="Checking session" noindex footer={false}>
          <p className="sp-status lg-center" role="status">Checking session…</p>
        </SiteShell>
      );
    }
    return (
      <PrivateShell className="prv-center">
        <span className="asc-mono prv-status" role="status">Checking session…</span>
      </PrivateShell>
    );
  }

  if (status === 'error') {
    if (light) {
      return (
        <SiteShell docTitle="Could not reach the server" noindex footer={false}>
          <div className="lg-center" role="alert">
            <p className="sp-text">Could not reach the server.</p>
            <button type="button" className="btn btn-line" onClick={refresh}>Retry</button>
          </div>
        </SiteShell>
      );
    }
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
