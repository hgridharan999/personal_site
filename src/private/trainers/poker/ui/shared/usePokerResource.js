import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../../lib/api.js';

/**
 * Loads `load(key)`. While reloading the same key it keeps the last data, so panels do not blank; a new key starts
 * empty. A 401 sends the user to /login and back to `loginFrom` afterwards. `load` must be defined at module scope.
 */
export function usePokerResource(load, key, loginFrom) {
  const navigate = useNavigate();
  const [state, setState] = useState({ key, status: 'loading', data: null, error: null, errorStatus: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setState((s) => ({ key, status: 'loading', data: s.key === key ? s.data : null, error: null, errorStatus: null }));
    load(key)
      .then((data) => {
        if (live) setState({ key, status: 'ready', data, error: null, errorStatus: null });
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 401) {
          navigate('/login', { replace: true, state: { from: loginFrom } });
          return;
        }
        const error = err instanceof Error ? err.message : 'Request failed';
        const errorStatus = err instanceof ApiError ? err.status : null;
        setState((s) => ({ key, status: 'error', data: s.key === key ? s.data : null, error, errorStatus }));
      });
    return () => { live = false; };
  }, [load, key, nonce, navigate, loginFrom]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  if (state.key !== key) return { status: 'loading', data: null, error: null, errorStatus: null, reload };
  return { status: state.status, data: state.data, error: state.error, errorStatus: state.errorStatus, reload };
}
