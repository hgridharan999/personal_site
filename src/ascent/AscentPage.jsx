import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Linkedin, Github, Mail, Download, ArrowUpRight } from 'lucide-react';
import { gsap, useGSAP } from '../lib/gsap';
import Cursor from './Cursor';
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

export default function AscentPage() {
  const root = useRef(null);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    gsap.set(q('.asc-rise'), { yPercent: 120 });
    gsap.set(q('.asc-in'), { opacity: 0, y: 14 });
    gsap.timeline({ delay: 0.2 })
      .to(q('.asc-rise'), { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 }, 0.05)
      .to(q('.asc-in'), { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.055 }, 0.1);
  }, { scope: root });

  return (
    <div
      ref={root}
      className="asc"
      style={{ background: 'transparent', minHeight: '100svh', position: 'relative', overflow: 'hidden' }}
    >
      <Cursor />

      {/* identity cluster — top-left, compact */}
      <div style={{ width: 'min(92vw, 1440px)', margin: '0 auto', paddingTop: 'clamp(44px, 11vh, 128px)' }}>
        <div style={{ maxWidth: 'min(90vw, 540px)', display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2vh, 22px)' }}>

          {/* credential */}
          <span className="asc-mono asc-in" style={{ color: 'var(--muted)' }}>
            Cornell Dyson ’29 — Dyson Scholar
          </span>

          {/* name — "Hari" carries the serif accent now */}
          <h1 className="asc-h" style={{ fontSize: 'clamp(38px, 6vw, 80px)', lineHeight: 0.92 }}>
            <span className="asc-line-mask" style={{ display: 'block' }}>
              <span className="asc-rise asc-serif-it asc-amber" style={{ fontWeight: 400, letterSpacing: '0', textTransform: 'none' }}>Hari</span>
            </span>
            <span className="asc-line-mask" style={{ display: 'block' }}>
              <span className="asc-rise" style={{ textTransform: 'uppercase' }}>Gridharan</span>
            </span>
          </h1>

          {/* tagline */}
          <span className="asc-mono asc-in" style={{ color: 'var(--muted)' }}>Founder · AI · Consulting</span>

          {/* section index */}
          <nav className="asc-nav" style={{ marginTop: 'clamp(4px, 1vh, 12px)' }}>
            {NAV.map((s) => (
              <Link key={s.to} to={s.to} data-hot className="asc-nav-link asc-in">
                <span className="asc-nav-link__idx">{s.n}</span>
                <span className="asc-nav-link__name">{s.label}</span>
                <ArrowUpRight className="asc-nav-link__arrow" size={20} />
              </Link>
            ))}
          </nav>

          {/* socials */}
          <div className="asc-in" style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 4 }}>
            {SOCIAL.map(({ icon: Icon, label, href, download }) => (
              <a
                key={label}
                href={href}
                download={download}
                target={download ? undefined : '_blank'}
                rel="noopener noreferrer"
                aria-label={label}
                data-hot
                className="asc-link"
                style={{ color: 'var(--muted)', display: 'inline-flex' }}
              >
                <Icon size={18} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
