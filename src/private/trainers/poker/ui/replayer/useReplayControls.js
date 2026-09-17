import { useCallback, useEffect, useReducer } from 'react';
import { PLAY_INTERVAL_MS, replayReducer, replayKeyAction } from './replayModel.js';

const isFormField = (target) => target instanceof Element && Boolean(target.closest('input, select, textarea, [contenteditable="true"]'));

/** Step state with keyboard control (←/→, Space, Home, End) and autoplay. */
export function useReplayControls(count, initialIndex) {
  const [state, rawDispatch] = useReducer(replayReducer, { index: initialIndex, playing: false });
  const dispatch = useCallback((type, extra = {}) => rawDispatch({ type, count, ...extra }), [count]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isFormField(event.target)) return;
      const type = replayKeyAction(event.key);
      if (!type) return;
      // Space on a focused button would also click it; the key handler owns play/pause.
      event.preventDefault();
      dispatch(type);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  useEffect(() => {
    if (!state.playing) return undefined;
    const timer = setTimeout(() => dispatch('tick'), PLAY_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [state, dispatch]);

  return { index: state.index, playing: state.playing, dispatch };
}
