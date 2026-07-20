import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import SubShell from './SubShell';
import { CompanyLogo } from './logos';
import { EXPERIENCES } from './data';

export default function AscentWork() {
  const [sel, setSel] = useState(0);
  const e = EXPERIENCES[sel];

  return (
    <SubShell index="01" title="Work" current="Work" subtitle="Roles, teams, and the things I’ve shipped.">
      <div className="asc-md">
        <div className="asc-md-list">
          {EXPERIENCES.map((x, i) => (
            <button
              key={i}
              className={`asc-md-item ${i === sel ? 'is-active' : ''}`}
              data-hot
              onClick={() => setSel(i)}
              onMouseEnter={() => setSel(i)}
            >
              <span className="asc-md-idx">{String(i + 1).padStart(2, '0')}</span>
              <span className="asc-md-name">{x.title}</span>
              <span className="asc-md-sub" style={{ color: 'var(--amber)', fontSize: 11 }}>{x.company}</span>
            </button>
          ))}
        </div>

        <div className="asc-md-detail" key={sel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div className="asc-logo-tile"><CompanyLogo company={e.company} size={56} /></div>
            <div>
              <div className="asc-mono" style={{ color: 'var(--faint)', marginBottom: 6 }}>{e.period}</div>
              <a href={e.url} target="_blank" rel="noopener noreferrer" data-hot className="asc-link"
                 style={{ color: 'var(--amber)', fontFamily: 'var(--display)', fontWeight: 800, letterSpacing: '-0.01em', fontSize: 'clamp(20px, 2.2vw, 30px)', lineHeight: 1.05, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {e.company} <ArrowUpRight size={18} />
              </a>
            </div>
          </div>
          <h2 className="asc-detail-title">{e.title}</h2>
          <p className="asc-detail-desc">{e.description}</p>
          <span className="asc-mono" style={{ color: 'var(--faint)' }}>{e.location}</span>
        </div>
      </div>
    </SubShell>
  );
}
