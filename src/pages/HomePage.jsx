import { Link } from 'react-router-dom';
import { Linkedin, Github, Mail, Download, ArrowUpRight } from 'lucide-react';

const NAME = 'Hari Gridharan';

// Order matters: Work → Projects → Hiking → Theses.
const SECTIONS = [
  { label: 'Work',     to: '/work' },
  { label: 'Projects', to: '/projects' },
  { label: 'Hiking',   to: '/climbing' },
  { label: 'Theses',   to: '/blog' },
];

const SOCIAL = [
  { icon: Linkedin, label: 'LinkedIn', href: 'https://www.linkedin.com/in/harigridharan1/' },
  { icon: Github,   label: 'GitHub',   href: 'https://github.com/hgridharan999' },
  { icon: Mail,     label: 'Email',    href: 'mailto:hg532@cornell.edu' },
  { icon: Download, label: 'Resume',   href: '/Gridharan_Hari_Resume.pdf', download: true },
];

const NAME_END = 0.2 + NAME.length * 0.05; // when the letter cascade finishes

export default function HomePage() {
  return (
    <div className="h-[100dvh] w-full overflow-hidden flex items-start justify-start px-7 sm:px-12 lg:px-16 pt-6 sm:pt-9">
      <div
        className="font-display w-full max-w-sm flex flex-col gap-3"
        style={{ textShadow: '0 1px 16px rgba(0,0,0,0.55)' }}
      >

        {/* Identity — face-cropped portrait + credential */}
        <div className="flex items-center gap-4 hero-fade" style={{ animationDelay: '0.05s' }}>
          <div
            role="img"
            aria-label="Hari Gridharan"
            className="w-36 h-36 rounded-full border-[3px] border-paper ring-1 ring-line shadow-photo shrink-0"
            style={{
              backgroundImage: 'url(/profile.jpg)',
              backgroundSize: '200%',
              backgroundPosition: '6% 16%',
              backgroundRepeat: 'no-repeat',
              backgroundColor: '#E8E2D6',
            }}
          />
          <p className="font-display text-[13px] uppercase tracking-[0.26em] text-paper/75 leading-relaxed">
            Cornell Dyson ’29<br />Dyson Scholar
          </p>
        </div>

        {/* Name — CSS letter cascade */}
        <h1
          className="font-signature text-5xl sm:text-6xl text-paper leading-[0.9]"
          style={{ display: 'flex', flexWrap: 'wrap' }}
          aria-label={NAME}
        >
          {NAME.split('').map((char, i) => (
            <span
              key={i}
              className="hero-letter"
              aria-hidden="true"
              style={{ animationDelay: `${0.2 + i * 0.05}s`, whiteSpace: char === ' ' ? 'pre' : 'normal' }}
            >
              {char === ' ' ? ' ' : char}
            </span>
          ))}
        </h1>

        <p className="font-display text-base tracking-wide text-paper/80 leading-snug hero-fade" style={{ animationDelay: `${NAME_END}s` }}>
          Founder · AI · Consulting
        </p>

        {/* Sections — no divider lines; navigating zooms the panorama */}
        <nav className="flex flex-col gap-0.5 mt-1">
          {SECTIONS.map((s, i) => (
            <Link
              key={s.to}
              to={s.to}
              className="section-link group flex items-center justify-between py-1 hero-fade"
              style={{ animationDelay: `${NAME_END + 0.1 + i * 0.07}s` }}
            >
              <span className="font-display text-2xl sm:text-[1.75rem] font-medium text-paper leading-none transition-colors group-hover:text-highlight">
                {s.label}
              </span>
              <ArrowUpRight className="w-5 h-5 text-paper/50 shrink-0 transition-all duration-300 group-hover:text-highlight group-hover:translate-x-1 group-hover:-translate-y-1" />
            </Link>
          ))}
        </nav>

        {/* Social */}
        <div className="flex items-center gap-4 mt-1 hero-fade" style={{ animationDelay: `${NAME_END + 0.45}s` }}>
          {SOCIAL.map(({ icon: Icon, label, href, download }) => (
            <a
              key={label}
              href={href}
              aria-label={label}
              download={download}
              target={download ? undefined : '_blank'}
              rel="noopener noreferrer"
              className="text-paper/70 hover:text-highlight transition-colors"
            >
              <Icon className="w-[18px] h-[18px]" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
