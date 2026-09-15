const TEXT = {
  saving: 'Saving… (kept on this device and retried until it goes through)',
  saved: 'Saved',
  failed: 'Not saved: the server rejected this game (details at the top of the page)',
  error: 'Not saved',
};

export default function SaveStatus({ status, error }) {
  if (status === 'idle') return null;
  return (
    <p className={`trn-save trn-save--${status}`} role="status">
      {TEXT[status]}
      {status === 'error' && error ? `: ${error}` : ''}
    </p>
  );
}
