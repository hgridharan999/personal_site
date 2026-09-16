import { useEffect, useState } from 'react';
import { loadPokerProfile } from './profileLoader.js';

/** The hero's profile at sit-down. loadPokerProfile never rejects and gives up after 4 s. */
export function usePokerProfile() {
  const [state, setState] = useState({ status: 'loading', profile: null });
  useEffect(() => {
    let live = true;
    loadPokerProfile().then((profile) => {
      if (live) setState({ status: 'ready', profile });
    });
    return () => { live = false; };
  }, []);
  return state;
}
