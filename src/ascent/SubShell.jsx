import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { gsap, useGSAP } from '../lib/gsap';
import Cursor from './Cursor';
import './ascent.css';

/**
 * Shared shell for the Ascent subpages — a fixed, single-screen (no page
 * scroll) frame: back bar, compact mask-rise header, a flex body slot the page
 * fills (master ⇄ detail), and a thin footer. Custom cursor + entrance only.
 */
export default function SubShell({ index, title, current, subtitle, children }) {
  const root = useRef(null);

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#0B0A0A';
    return () => { document.body.style.background = prev; };
  }, []);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    gsap.set(q('.asc-rise'), { yPercent: 120 });
    gsap.set(q('.asc-in'), { opacity: 0, y: 12 });
    gsap.timeline({ delay: 0.1 })
      .to(q('.asc-rise'), { yPercent: 0, duration: 1, ease: 'expo.out' }, 0)
      .to(q('.asc-in'), { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.05 }, 0.15);
  }, { scope: root });

  return (
    <div ref={root} className="asc asc-sub">
      <Cursor />

      <div className="asc-topbar">
        <Link to="/" data-hot className="asc-back asc-mono asc-in">
          <ArrowLeft size={14} /> <span className="b-name">Hari Gridharan</span>
        </Link>
      </div>

      <div className="asc-sub-body">
        <header className="asc-sub-head">
          <h1 className="asc-h asc-sub-title">
            <span className="asc-line-mask"><span className="asc-rise">{title}</span></span>
          </h1>
          {subtitle && <p className="asc-sub-sub asc-in">{subtitle}</p>}
        </header>

        <div className="asc-in" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', paddingBottom: 8 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
