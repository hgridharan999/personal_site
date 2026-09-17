import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PrivateShell from '../../../PrivateShell';
import './poker.css';

const FONT_ID = 'pk-font-silkscreen';
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Silkscreen&display=swap';

// Silkscreen loads only when a poker page mounts, so public pages never fetch it.
function usePixelFont() {
  useEffect(() => {
    if (document.getElementById(FONT_ID)) return;
    const link = Object.assign(document.createElement('link'), { id: FONT_ID, rel: 'stylesheet', href: FONT_HREF });
    document.head.appendChild(link);
  }, []);
}

const LOBBY_BACK = { to: '/me', label: 'Base Camp' };

/** Private-area frame for every poker page. `.pk` scopes the Midnight Indigo tokens. */
export default function PokerShell({ back = LOBBY_BACK, onBack, children }) {
  usePixelFont();
  return (
    <PrivateShell className="pk" customCursor={false}>
      <div className="asc-topbar">
        <Link to={back.to} onClick={onBack} data-hot className="asc-back asc-mono">
          <ArrowLeft size={14} /> <span className="b-name">{back.label}</span>
        </Link>
      </div>
      <main className="pk-main">{children}</main>
    </PrivateShell>
  );
}
