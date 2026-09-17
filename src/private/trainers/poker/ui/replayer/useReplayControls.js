import { useCallback, useEffect, useReducer } from 'react';
import { PLAY_INTERVAL_MS, replayReducer, replayKeyAction, shouldHandleReplayKey } from './replayModel.js';

const isFormField = (target) => target instanceof Element && Boolean(target.closest('input, select, textarea, [contenteditable="true"]'));
// A button, link or summary handles its own Space (it would also activate the focused control), so the
// key handler leaves Space to it there while still stepping the replay for ←/→/Home/End.
const isInteractiveControl = (target) => target instanceof Element && Boolean(target.closest('button, a, summary'));

/** Step state with keyboard control (←/→, Space, Home, End) and autoplay. */
export function useReplayControls(count, initialIndex) {
  const [state, rawDispatch] = useReducer(replayReducer, { index: initialIndex, playing: false });
  const dispatch = useCallback((type, extra = {}) => rawDispatch({ type, count, ...extra }), [count]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isFormField(event.target)) return;
      if (!shouldHandleReplayKey({ key: event.key, insideInteractive: isInteractiveControl(event.target) })) return;
      const type = replayKeyAction(event.key);
      // Space on a focused button would also click it; the key handler owns play/pause outside controls.
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
