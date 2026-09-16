// Table keyboard map. Pure: turns a keydown into a command, or null to let the browser handle it.
//
// Outside sizing:  F fold · C check/call · R open sizing · 1-5 presets (1/3, 1/2, 2/3, pot, all-in)
// Always:          ArrowUp/ArrowDown adjust by 0.5 BB (Shift: 5 BB)
// While sizing:    Enter confirm · Escape cancel · digits and "." are typed into the size input

export const NUDGE_UNITS = 1; // 0.5 BB
export const NUDGE_SHIFT_UNITS = 10; // 5 BB

/**
 * @param {{ key:string, shiftKey?:boolean, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean }} event
 * @param {{ heroTurn:boolean, sizing:boolean }} ctx
 * @returns {null | {type:'fold'} | {type:'checkCall'} | {type:'openSizing'} | {type:'preset', index:number}
 *   | {type:'nudge', units:number} | {type:'confirm'} | {type:'cancel'}}
 */
export function keyToCommand(event, { heroTurn, sizing }) {
  if (!heroTurn || event.ctrlKey || event.metaKey || event.altKey) return null;
  const { key } = event;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const step = event.shiftKey ? NUDGE_SHIFT_UNITS : NUDGE_UNITS;
    return { type: 'nudge', units: key === 'ArrowUp' ? step : -step };
  }
  if (sizing) {
    if (key === 'Enter') return { type: 'confirm' };
    if (key === 'Escape') return { type: 'cancel' };
    return null;
  }
  const lower = key.length === 1 ? key.toLowerCase() : key;
  if (lower === 'f') return { type: 'fold' };
  if (lower === 'c') return { type: 'checkCall' };
  if (lower === 'r') return { type: 'openSizing' };
  if (/^[1-5]$/.test(key)) return { type: 'preset', index: Number(key) - 1 };
  return null;
}
