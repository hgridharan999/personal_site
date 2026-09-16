import { useEffect, useRef } from 'react';
import { PRESETS } from '../../lib/sizing.js';
import { formatBb } from '../../lib/format.js';

/** Presets, the raise-to input (in BB) and cancel. Mounted only while sizing is open. */
export default function SizingPanel({ sizing, legal, dispatch }) {
  const input = useRef(null);

  // Focus and select on open, so typing a number replaces the suggested size.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const applyPreset = (index) => {
    dispatch({ type: 'preset', index });
    input.current?.focus();
  };

  return (
    <div className="pk-sizing">
      <div className="pk-sizing__presets">
        {PRESETS.map((preset, index) => (
          <button
            key={preset.key}
            type="button"
            className="pk-btn pk-btn--preset"
            data-hot
            aria-keyshortcuts={String(index + 1)}
            onClick={() => applyPreset(index)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label className="pk-sizing__field">
        <span className="pk-sr-only">{legal.raiseKind === 'bet' ? 'Bet' : 'Raise to'}, in big blinds</span>
        <input
          ref={input}
          className="pk-size-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={sizing.text}
          aria-describedby="pk-sizing-range"
          onChange={(e) => dispatch({ type: 'text', text: e.target.value })}
        />
        <span aria-hidden="true">BB</span>
      </label>
      <span id="pk-sizing-range" className="pk-muted">
        {formatBb(legal.minRaiseTo)} to {formatBb(legal.maxRaiseTo)} BB
      </span>
      <button type="button" className="pk-btn pk-btn--fold" data-hot aria-keyshortcuts="Escape" onClick={() => dispatch({ type: 'cancel' })}>
        Cancel <kbd>Esc</kbd>
      </button>
    </div>
  );
}
