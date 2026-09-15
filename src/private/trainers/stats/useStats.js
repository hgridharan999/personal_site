import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, getStats } from '../lib/api';

// Loads stats for one (trainer, mode, configKey). Keeps the previous data while
// reloading so the page doesn't blank; redirects to /login if the session expired.
export function useStats({ trainer, mode, configKey }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setState((s) => ({ status: 'loading', data: s.data, error: null }));
    getStats({ trainer, mode, configKey })
      .then((data) => {
        if (live) setState({ status: 'ready', data, error: null });
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 401) {
          navigate('/login', { replace: true, state: { from: `/me/${trainer}` } });
          return;
        }
        setState((s) => ({ status: 'error', data: s.data, error: err instanceof Error ? err.message : 'Request failed' }));
      });
    return () => { live = false; };
  }, [trainer, mode, configKey, nonce, navigate]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
