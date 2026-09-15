import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'hari-site-consent';

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function saveChoice(choice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-2 z-40 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-transparent px-3 py-1 text-xs shadow-none text-white" style={{ fontFamily: 'inherit' }}>
        <span className="text-white text-xs">We use minimal local preferences.</span>
        <Link to="/privacy" className="underline underline-offset-2 text-white/90 hover:text-white text-xs">Privacy</Link>
        <button
          onClick={() => saveChoice('accepted')}
          className="ml-1 rounded-full bg-ink px-2 py-0.5 text-[11px] text-white hover:opacity-90"
          aria-label="Acknowledge privacy"
        >
          OK
        </button>
      </div>
    </div>
  );
}
