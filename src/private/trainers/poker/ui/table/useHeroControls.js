import { useCallback, useEffect, useRef, useState } from 'react';
import { keyToCommand } from '../../lib/keys.js';
import { SIZING_CLOSED, sizingReducer, resolveRaise } from '../../lib/sizing.js';

const FIELD = 'input, textarea, select, [contenteditable="true"]';

/**
 * Sizing state, command dispatch and the table's keyboard shortcuts.
 * @param {{ turn: {view:object, legal:object, stack:number}|null, turnKey:string, onAct:(choice:object) => void }} args
 *   turnKey changes whenever a new decision starts, which closes the sizing panel.
 */
export function useHeroControls({ turn, turnKey, onAct }) {
  const [sizing, setSizing] = useState(SIZING_CLOSED);

  useEffect(() => {
    setSizing(SIZING_CLOSED);
  }, [turnKey]);

  const dispatch = useCallback((command) => {
    if (!turn) return;
    const { legal } = turn;
    if (command.type === 'fold') {
      // Folding when a free check is available is disabled.
      if (!legal.canCheck) onAct({ action: 'fold' });
    } else if (command.type === 'checkCall') {
      onAct({ action: legal.canCheck ? 'check' : 'call' });
    } else if (command.type === 'confirm') {
      const choice = resolveRaise(sizing, legal);
      if (choice) onAct(choice);
    } else {
      setSizing((current) => sizingReducer(current, command, turn));
    }
  }, [turn, sizing, onAct]);

  const latest = useRef(dispatch);
  latest.current = dispatch;

  useEffect(() => {
    const onKeyDown = (event) => {
      const { target } = event;
      const field = target instanceof Element ? target.closest(FIELD) : null;
      if (field && !field.classList.contains('pk-size-input')) return;
      const command = keyToCommand(event, { heroTurn: Boolean(turn), sizing: sizing.open });
      if (!command) return;
      event.preventDefault();
      latest.current(command);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [turn, sizing.open]);

  return { sizing, dispatch };
}
