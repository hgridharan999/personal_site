import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import PrivateShell from './PrivateShell';

// Placeholder sections. Shape: { name, desc, to } (internal route or external URL).
// Anything listed here ships in the public JS bundle — only add entries that are
// fine for anyone to see; serve genuinely private links from an /api route
// that checks verifySession().
const SECTIONS = [
  { key: 'apps', n: '01', title: 'Applications', items: [] },
  {
    key: 'trainers',
    n: '02',
    title: 'Trainers',
    items: [
      { name: 'Zetamac', desc: 'Arithmetic sprint · auto-advance · drills', to: '/me/zetamac' },
      { name: 'Optiver 80 in 8', desc: '80 questions · 8 minutes · +1 / −1', to: '/me/optiver' },
      { name: 'Poker', desc: 'No-Limit Hold’em · 6-max · you vs. 5 bots', to: '/me/poker' },
    ],
  },
];

function SectionItem({ name, desc, to }) {
  const external = /^https?:\/\//.test(to);
  const props = { 'data-hot': true, className: 'prv-item' };
  const body = (
    <>
      <span className="prv-item__name">{name}</span>
      {desc && <span className="prv-item__desc">{desc}</span>}
    </>
  );
  return external
    ? <a href={to} target="_blank" rel="noopener noreferrer" {...props}>{body}</a>
    : <Link to={to} {...props}>{body}</Link>;
}

/** Rendered only behind <RequireAuth>, which redirects to /login once the session clears. */
export default function PrivateHome({ onLogout }) {
  const [leaving, setLeaving] = useState(false);

  const handleLogout = async () => {
    setLeaving(true);
    try {
      await onLogout();
    } catch {
      setLeaving(false);
    }
  };

  return (
    <PrivateShell>
      <div className="asc-topbar">
        <Link to="/" data-hot className="asc-back asc-mono">
          <ArrowLeft size={14} /> <span className="b-name">Public site</span>
        </Link>
        <button type="button" data-hot className="asc-mono prv-logout" onClick={handleLogout} disabled={leaving}>
          <LogOut size={13} /> {leaving ? 'Signing out' : 'Sign out'}
        </button>
      </div>

      <main className="asc-wrap prv-home">
        <header className="prv-home-head">
          <span className="asc-mono" style={{ color: 'var(--faint)' }}>Private</span>
          <h1 className="asc-h prv-title">
            <span className="asc-serif-it asc-amber" style={{ fontWeight: 400 }}>Base</span> Camp
          </h1>
        </header>

        <div className="prv-grid">
          {SECTIONS.map((s) => (
            <section key={s.key} className="prv-section" aria-labelledby={`prv-${s.key}`}>
              <h2 id={`prv-${s.key}`} className="prv-section__title">
                <span className="asc-nav-link__idx">{s.n}</span> {s.title}
              </h2>
              {s.items.length === 0 ? (
                <p className="prv-empty asc-mono">Nothing here yet</p>
              ) : (
                <div className="prv-list">
                  {s.items.map((item) => <SectionItem key={item.to} {...item} />)}
                </div>
              )}
            </section>
          ))}
        </div>
      </main>
    </PrivateShell>
  );
}
