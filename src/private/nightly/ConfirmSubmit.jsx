import { useEffect, useRef } from 'react';

/** The inline "are you sure" for submit (no window.confirm). Focus lands on Confirm; Escape cancels. */
export default function ConfirmSubmit({ onConfirm, onCancel }) {
  const confirmRef = useRef(null);
  useEffect(() => { confirmRef.current?.focus(); }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="nt-confirm" role="group" aria-labelledby="nt-confirm-q" onKeyDown={onKeyDown}>
      <p id="nt-confirm-q" className="nt-confirm__q">This locks your answers. Submit?</p>
      <div className="nt-confirm__buttons">
        <button ref={confirmRef} type="button" className="nt-btn nt-btn--primary" onClick={onConfirm}>Confirm</button>
        <button type="button" className="nt-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
