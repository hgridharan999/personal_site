import { useCallback, useEffect, useState } from 'react';

async function authRequest(method, body) {
  const res = await fetch('/api/auth', {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/**
 * Session state for the private area. The server cookie is HttpOnly, so the
 * client can only ask /api/auth whether it's valid.
 * status: 'loading' | 'authed' | 'anon' | 'error'
 */
export function useSession() {
  const [status, setStatus] = useState('loading');

  const refresh = useCallback(async () => {
    try {
      const { authenticated } = await authRequest('GET');
      setStatus(authenticated ? 'authed' : 'anon');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (password) => {
    await authRequest('POST', { password });
    setStatus('authed');
  }, []);

  const logout = useCallback(async () => {
    await authRequest('DELETE');
    setStatus('anon');
  }, []);

  return { status, login, logout, refresh };
}
