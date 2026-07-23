import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Linkedin, Github, Mail, Download, ArrowUpRight } from 'lucide-react';
import { gsap, useGSAP } from '../lib/gsap';
import Cursor from './Cursor';
import Magnetic from './Magnetic';
import SplitReveal from './SplitReveal';
import ScrambleText from './ScrambleText';
import PageInstrument from './PageInstrument';
import { useMagnetic } from './useMagnetic';
import './ascent.css';

/**
 * "The Ascent" — the original home layout (top-left identity + section index),
 * rebuilt in the redesign language: Archivo / Space Mono / Instrument Serif,
 * bone + amber on warm black, custom cursor, choreographed entrance — sitting
 * over the storm hiker background (the global <HikerHeroScene> on this route).
 * Single screen, no scroll — keeps the original's simplicity.
 */

const NAV = [
  { n: '01', label: 'Work',     to: '/work' },
  { n: '02', label: 'Projects', to: '/projects' },
  { n: '03', label: 'Hiking',   to: '/hiking' },
  { n: '04', label: 'Theses',   to: '/theses' },
];

const SOCIAL = [
  { icon: Linkedin, label: 'LinkedIn', href: 'https://www.linkedin.com/in/harigridharan1/' },
  { icon: Github,   label: 'GitHub',   href: 'https://github.com/hgridharan999' },
  { icon: Mail,     label: 'Email',    href: 'mailto:hg532@cornell.edu' },
  { icon: Download, label: 'Resume',   href: '/Gridharan_Hari_Resume.pdf', download: true },
];

// Nav row that leans toward the cursor. The magnetic ref sits on the <Link>
// itself so it stays a direct child of .asc-nav (keeps the border rules intact).
function MagneticNavLink({ to, n, label, idx }) {
  const ref = useMagnetic(0.16, 0.32);
  return (
    <Link ref={ref} to={to} data-hot className="asc-nav-link asc-in">
      <span className="asc-nav-link__idx">{n}</span>
      <ScrambleText className="asc-nav-link__name" text={label} hover delay={360 + idx * 80} duration={460} />
      <ArrowUpRight className="asc-nav-link__arrow" data-mag-child size={20} />
    </Link>
  );
}

export default function AscentPage() {
  const root = useRef(null);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    gsap.set(q('.asc-rise'), { yPercent: 120 });
    gsap.set(q('.asc-in'), { opacity: 0, y: 14 });
    gsap.timeline({ delay: 0.15 })
      .to(q('.asc-rise'), { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 }, 0.05)
      .to(q('.asc-in'), { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out', stagger: 0.05 }, 0.05);
  }, { scope: root });

  // Fail-safe: guarantee the identity is visible even if the entrance stalls
  // during a fast route transition (setTimeout fires regardless of RAF).
  useEffect(() => {
    const el = root.current;
    const id = setTimeout(() => {
      el?.querySelectorAll('.asc-in, .asc-rise').forEach((n) => { n.style.opacity = '1'; n.style.transform = 'none'; });
    }, 1400);
    return () => clearTimeout(id);
  }, []);

  return (
    <div
      ref={root}
      className="asc"
      style={{ background: 'transparent', minHeight: '100svh', position: 'relative', overflow: 'hidden' }}
    >
      <Cursor />

      {/* compass — aligned to the identity container's top-right edge */}
      <div className="asc-in" style={{ position: 'absolute', top: 'clamp(40px, 10vh, 120px)', right: 'max(4vw, calc((100vw - 1440px) / 2))', zIndex: 3, pointerEvents: 'none' }}>
        <PageInstrument variant="home" size={140} />
      </div>

      {/* identity cluster — top-left, compact */}
      <div style={{ width: 'min(92vw, 1440px)', margin: '0 auto', paddingTop: 'clamp(44px, 11vh, 128px)' }}>
        <div style={{ maxWidth: 'min(90vw, 540px)', display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2vh, 22px)' }}>

          {/* credential */}
          <span className="asc-mono asc-in" style={{ color: 'var(--muted)' }}>
            Cornell Dyson ’29 — Dyson Scholar
          </span>

          {/* name — "Hari" carries the serif accent now; letters rise per-glyph */}
          <h1 className="asc-h" style={{ fontSize: 'clamp(38px, 6vw, 80px)', lineHeight: 0.92 }}>
            <SplitReveal
              text="Hari"
              className="asc-serif-it asc-amber"
              delay={250}
              style={{ display: 'block', fontWeight: 400, letterSpacing: '0', textTransform: 'none' }}
            />
            <SplitReveal
              text="Gridharan"
              delay={430}
              style={{ display: 'block', textTransform: 'uppercase' }}
            />
          </h1>

          {/* tagline */}
          <span className="asc-mono asc-in" style={{ color: 'var(--muted)' }}>Founder · AI · Consulting</span>

          {/* section index */}
          <nav className="asc-nav" style={{ marginTop: 'clamp(4px, 1vh, 12px)' }}>
            {NAV.map((s, i) => (
              <MagneticNavLink key={s.to} to={s.to} n={s.n} label={s.label} idx={i} />
            ))}
          </nav>

          {/* socials */}
          <div className="asc-in" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginLeft: -10 }}>
            {SOCIAL.map(({ icon: Icon, label, href, download }) => (
              <Magnetic key={label} strength={0.45} childStrength={0.7} style={{ borderRadius: '50%' }}>
                <a
                  href={href}
                  download={download}
                  target={download ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  aria-label={label}
                  data-hot
                  style={{ color: 'var(--muted)', display: 'inline-flex', padding: 10, transition: 'color 0.3s var(--ease)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--amber)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
                >
                  <Icon data-mag-child size={18} />
                </a>
              </Magnetic>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
