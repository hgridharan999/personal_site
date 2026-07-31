import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'hari-site-consent';

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  function saveChoice(choice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Ignore storage failures and keep the banner visible.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-line bg-paper/95 px-4 py-3 shadow-page backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm leading-6 text-ink">
          This site uses minimal local preferences to remember your choice and to keep the chat experience working. It does not use third-party advertising or analytics. You can review the full notice in{' '}
          <Link to="/privacy" className="underline underline-offset-4 hover:text-highlight">
            our privacy policy
          </Link>
          .
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => saveChoice('declined')}
            className="rounded-sm border border-line px-3 py-1.5 text-sm text-ink transition-colors hover:bg-stone-100"
          >
            Decline
          </button>
          <button
            onClick={() => saveChoice('accepted')}
            className="rounded-sm bg-ink px-3 py-1.5 text-sm text-paper transition-colors hover:opacity-90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
