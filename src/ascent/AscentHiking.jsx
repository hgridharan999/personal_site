import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import SubShell from './SubShell';
import HikeMap from './HikeMap';
import { HIKES } from './data';

const BAR = { type: 'spring', stiffness: 600, damping: 44 };

export default function AscentHiking() {
  const [sel, setSel] = useState(0);
  const [pi, setPi] = useState(0);

  const h = HIKES[sel];
  const photos = h.photos || [];

  useEffect(() => { setPi(0); }, [sel]);

  return (
    <SubShell index="03" title="Hiking" current="Hiking" instrument="hiking">
      <div className="asc-hike-layout">

        {/* LEFT — scrollable hike list + map beneath it */}
        <div className="asc-hike-left">
          <div className="asc-hike-list">
            {HIKES.map((x, i) => (
              <button
                key={i}
                className={`asc-md-item ${i === sel ? 'is-active' : ''}`}
                data-hot
                onClick={() => setSel(i)}
              >
                {i === sel && <motion.span layoutId="hike-bar" className="asc-md-bar" transition={BAR} />}
                <span className="asc-md-idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="asc-md-name">{x.name}</span>
                <span className="asc-md-sub">{x.location}</span>
              </button>
            ))}
          </div>

          <div className="asc-hike-map">
            <HikeMap hikes={HIKES} active={sel} onSelect={setSel} />
            <span className="asc-map-credit asc-mono">Click a pin</span>
          </div>
        </div>

        {/* RIGHT — photos (fill) + info (natural height) for the selected hike */}
        <div className="asc-hike-right">
          <div className="asc-hike-media">
            {photos.length > 0 ? (
              <img key={`${sel}-${pi}`} src={photos[pi]} alt={h.name} />
            ) : (
              <span className="asc-mono" style={{ color: 'var(--faint)' }}>No photos — you had to be there</span>
            )}
          </div>

          <div className="asc-hike-info">
            {photos.length > 1 && (
              <div style={{ display: 'flex', gap: 8 }}>
                {photos.map((p, idx) => (
                  <button
                    key={idx}
                    data-hot
                    aria-label={`Photo ${idx + 1}`}
                    onClick={() => setPi(idx)}
                    onMouseEnter={() => setPi(idx)}
                    style={{ width: 58, height: 38, border: `1px solid ${idx === pi ? 'var(--amber)' : 'var(--line)'}`, padding: 0, overflow: 'hidden', background: 'none', opacity: idx === pi ? 1 : 0.5, transition: 'opacity .3s, border-color .3s' }}
                  >
                    <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}

            <div key={sel} className="asc-fade" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(6px, 1vh, 10px)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <h2 className="asc-detail-title" style={{ fontSize: 'clamp(22px, 2.4vw, 32px)', margin: 0 }}>{h.name}</h2>
                <div className="asc-mono" style={{ color: 'var(--faint)' }}>{h.date} · {h.location}</div>
              </div>
              <div className="asc-stats">
                <div className="asc-stat"><span>Elevation</span><b>{h.elevation}</b></div>
                <div className="asc-stat"><span>Distance</span><b>{h.distance}</b></div>
                <div className="asc-stat"><span>Grade</span><b className="asc-amber">{h.difficulty}</b></div>
              </div>
              <p className="asc-detail-desc" style={{ fontSize: 'clamp(13px, 0.95vw, 15px)', lineHeight: 1.45, maxWidth: 'none' }}>{h.review}</p>
              <div className="asc-tags">
                {h.highlights.map((t) => <span key={t} className="asc-tag">{t}</span>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SubShell>
  );
}
