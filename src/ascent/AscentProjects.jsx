import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Github, Lock, Star } from 'lucide-react';
import SubShell from './SubShell';
import { PROJECTS } from './data';

export default function AscentProjects() {
  const [sel, setSel] = useState(0);
  const p = PROJECTS[sel];

  return (
    <SubShell index="02" title="Projects" current="Projects">
      <div className="asc-md">
        <div className="asc-md-list">
          {PROJECTS.map((x, i) => (
            <button
              key={i}
              className={`asc-md-item ${i === sel ? 'is-active' : ''}`}
              data-hot
              onClick={() => setSel(i)}
              onMouseEnter={() => setSel(i)}
            >
              <span className="asc-md-idx">{String(i + 1).padStart(2, '0')}</span>
              <span className="asc-md-name">{x.title}</span>
              <span className="asc-md-sub">
                {x.featured ? '★ Featured' : x.stealth ? 'Stealth' : x.tech[0]}
              </span>
            </button>
          ))}
        </div>

        <div className="asc-md-detail" key={sel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="asc-mono" style={{ color: 'var(--faint)' }}>{p.date}</span>
            {p.featured && <Star size={14} className="asc-amber" fill="currentColor" />}
          </div>
          <h2 className="asc-detail-title">{p.title}</h2>
          <p className="asc-detail-desc">{p.description}</p>
          <div className="asc-tags">
            {p.tech.map((t) => <span key={t} className="asc-tag">{t}</span>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 4 }}>
            {p.internalUrl && (
              <Link to={p.internalUrl} data-hot className="asc-link asc-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Explore <ArrowUpRight size={13} />
              </Link>
            )}
            {p.liveUrl && (
              <a href={p.liveUrl} target="_blank" rel="noopener noreferrer" data-hot className="asc-link asc-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Live site <ArrowUpRight size={13} />
              </a>
            )}
            {p.githubUrl && (
              <a href={p.githubUrl} target="_blank" rel="noopener noreferrer" data-hot aria-label="GitHub" className="asc-link asc-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Github size={14} /> Source
              </a>
            )}
            {p.stealth && (
              <span className="asc-mono" style={{ color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Lock size={12} /> In stealth
              </span>
            )}
          </div>
        </div>
      </div>
    </SubShell>
  );
}
