import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const STORAGE_KEY = 'hari-site-consent';

// The homepage is white, where the dark pages' white-on-transparent pill would
// vanish, so "/" gets a light pill. Every other page keeps the original look.
const VARIANTS = {
  dark: {
    place: 'justify-center',
    pill: 'border-line bg-transparent text-white',
    text: 'text-white',
    link: 'text-white/90 hover:text-white',
    button: 'bg-ink text-white',
  },
  light: {
    // bottom-left and out of the reading column, so it never sits on top of a row
    place: 'justify-start pl-3',
    pill: 'border-black/15 bg-white/95 text-[#3D3D3D]',
    text: 'text-[#3D3D3D]',
    link: 'text-[#3D3D3D] hover:text-[#1A1A18]',
    button: 'bg-[#0F7DAA] text-white',
  },
};

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const { pathname } = useLocation();
  const v = pathname === '/' ? VARIANTS.light : VARIANTS.dark;

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
    <div className={`fixed inset-x-0 bottom-2 z-40 flex pointer-events-none ${v.place}`}>
      <div className={`pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-1 text-xs shadow-none ${v.pill}`} style={{ fontFamily: 'inherit' }}>
        <span className={`text-xs ${v.text}`}>We use minimal local preferences.</span>
        <Link to="/privacy" className={`underline underline-offset-2 text-xs ${v.link}`}>Privacy</Link>
        {/* The visible text is the accessible name (WCAG 2.5.3), and the button is
            at least 24px tall so it is an easy target on a phone (WCAG 2.5.8). */}
        <button
          type="button"
          onClick={() => saveChoice('accepted')}
          className={`ml-1 min-h-[24px] rounded-full px-2.5 py-1 text-[11px] hover:opacity-90 ${v.button}`}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
