import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import SubShell from './SubShell';
import { CompanyLogo } from './logos';
import { EXPERIENCES, WORK_LENSES } from './data';

const BAR = { type: 'spring', stiffness: 600, damping: 44 };
const LAYOUT = { type: 'spring', stiffness: 520, damping: 42 };

export default function AscentWork() {
  const [lens, setLens] = useState(null);           // null = all lenses
  const [company, setCompany] = useState(EXPERIENCES[0].company); // selection by identity

  // visible roles for the active lens, keeping their original data
  const visible = useMemo(
    () => (lens ? EXPERIENCES.filter((e) => e.category === lens) : EXPERIENCES),
    [lens]
  );

  // keep a valid selection when the filter changes
  const selected = visible.find((e) => e.company === company) || visible[0];

  const counts = useMemo(
    () => WORK_LENSES.map((l) => EXPERIENCES.filter((e) => e.category === l).length),
    []
  );

  // the 3D instrument lights the bar for the active lens (or the selected role's lens)
  const focus = WORK_LENSES.indexOf(lens || selected?.category);

  const chooseLens = (l) => {
    const next = lens === l ? null : l;
    setLens(next);
    const pool = next ? EXPERIENCES.filter((e) => e.category === next) : EXPERIENCES;
    if (!pool.some((e) => e.company === company)) setCompany(pool[0].company);
  };

  const e = selected;

  return (
    <SubShell index="01" title="Work" current="Work" instrument="work" instrumentCtl={{ focus }}>
      <div className="asc-md">
        <div className="asc-md-left">

          {/* lens filter */}
          <div className="asc-lens-row">
            <button className={`asc-lens ${lens === null ? 'is-on' : ''}`} data-hot onClick={() => chooseLens(null)}>
              {lens === null && <motion.span layoutId="lens-fill" className="asc-lens-fill" transition={BAR} />}
              <span className="asc-lens__label">All</span>
            </button>
            {WORK_LENSES.map((l, i) => (
              <button key={l} className={`asc-lens ${lens === l ? 'is-on' : ''}`} data-hot onClick={() => chooseLens(l)}>
                {lens === l && <motion.span layoutId="lens-fill" className="asc-lens-fill" transition={BAR} />}
                <span className="asc-lens__label">{l}<span className="asc-lens-count">{counts[i]}</span></span>
              </button>
            ))}
          </div>

          {/* reflowing list — removed roles unmount at once, the rest reposition */}
          <div className="asc-md-list">
            {visible.map((x) => (
              <motion.button
                key={x.company}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={LAYOUT}
                className={`asc-md-item ${x.company === company ? 'is-active' : ''}`}
                data-hot
                onClick={() => setCompany(x.company)}
                onMouseEnter={() => setCompany(x.company)}
              >
                {x.company === company && <motion.span layoutId="md-bar" className="asc-md-bar" transition={BAR} />}
                <span className="asc-md-name">{x.title}</span>
                <span className="asc-md-sub" style={{ color: 'var(--amber)' }}>{x.company}</span>
              </motion.button>
            ))}
          </div>
        </div>

        <div className="asc-md-detail" key={e.company}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div className="asc-logo-tile"><CompanyLogo company={e.company} size={56} /></div>
            <div>
              <div className="asc-mono" style={{ color: 'var(--faint)', marginBottom: 6 }}>
                <span className="asc-amber">{e.category}</span> · {e.period}
              </div>
              {e.url ? (
                <a href={e.url} target="_blank" rel="noopener noreferrer" data-hot className="asc-link"
                   style={{ color: 'var(--amber)', fontFamily: 'var(--display)', fontWeight: 800, letterSpacing: '-0.01em', fontSize: 'clamp(20px, 2.2vw, 30px)', lineHeight: 1.05, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {e.company} <ArrowUpRight size={18} />
                </a>
              ) : (
                <span style={{ color: 'var(--amber)', fontFamily: 'var(--display)', fontWeight: 800, letterSpacing: '-0.01em', fontSize: 'clamp(20px, 2.2vw, 30px)', lineHeight: 1.05, display: 'inline-block' }}>
                  {e.company}
                </span>
              )}
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
