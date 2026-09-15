import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SubShell from './SubShell';
import HikeMap from './HikeMap';
import { HIKES, HIKES_BY_STATE } from './data';

// Selection bar — an unhurried, non-bouncy glide (~0.8s) rather than a snap.
const BAR = { type: 'spring', stiffness: 170, damping: 30 };
// Group expand/collapse. A tween, not a spring: height:auto costs a layout pass
// per frame, so a fixed, short-and-known curve is both calmer and cheaper.
const GROUP = { type: 'tween', duration: 0.55, ease: [0.22, 1, 0.36, 1] };

// 240px thumbnails live alongside the 1600px display images
const thumbOf = (src) => src.replace('/hikes/', '/hikes/t/');

export default function AscentHiking() {
  const [sel, setSel] = useState(0);
  const [pi, setPi] = useState(0);
  const [openGroups, setOpenGroups] = useState(() => {
    const init = {};
    HIKES_BY_STATE.forEach((g) => { init[g.state] = false; });
    return init;
  });

  const h = HIKES[sel];
  const photos = h.photos || [];

  useEffect(() => { setPi(0); }, [sel]);

  // prepare stable global indices for groups and visible indices for the map
  let _idx = 0;
  const groups = HIKES_BY_STATE.map((g) => {
    const indices = g.hikes.map(() => _idx++);
    return { ...g, indices };
  });
  const visibleIndices = new Set();
  groups.forEach((g) => { if (openGroups[g.state]) g.indices.forEach((i) => visibleIndices.add(i)); });

  return (
    <SubShell index="03" title="Hiking" current="Hiking" instrument="hiking">
      <div className="asc-hike-layout">

        {/* LEFT — scrollable hike list + map beneath it */}
        <div className="asc-hike-left">
          <div className="asc-hike-list">
            {(() => {
              return groups.map((group) => {
                const open = !!openGroups[group.state];
                return (
                  <div key={group.state} className="asc-hike-group">
                    <button
                      className={`asc-hike-group-header ${open ? 'is-open' : 'is-closed'}`}
                      onClick={() => setOpenGroups((s) => ({ ...s, [group.state]: !s[group.state] }))}
                      aria-expanded={open}
                    >
                      <span className="asc-hike-group-chevron">{open ? '▾' : '▸'}</span>
                      <span>{group.state}</span>
                    </button>

                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          key="list"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={GROUP}
                          style={{ overflow: 'hidden' }}
                        >
                          {group.hikes.map((x, idxInGroup) => {
                            const global = group.indices[idxInGroup];
                            return (
                              <button
                                key={global}
                                className={`asc-md-item ${global === sel ? 'is-active' : ''}`}
                                data-hot
                                onClick={() => setSel(global)}
                              >
                                {global === sel && <motion.span layoutId="hike-bar" className="asc-md-bar" transition={BAR} />}
                                <span className="asc-md-idx">{String(global + 1).padStart(2, '0')}</span>
                                <span className="asc-md-name">{x.name}</span>
                                <span className="asc-md-sub">{x.location}</span>
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              });
            })()}
          </div>

          <div className="asc-hike-map">
            <HikeMap hikes={HIKES} active={sel} onSelect={setSel} visibleIndices={visibleIndices} />
            <span className="asc-map-credit asc-mono">Click a pin</span>
          </div>
        </div>

        {/* RIGHT — photos (fill) + info (natural height) for the selected hike */}
        <div className="asc-hike-right">
          <div className="asc-hike-media">
            {photos.length > 0 ? (
              <img src={photos[pi]} alt={h.name} decoding="async" fetchpriority="high" />
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
                    <img src={thumbOf(p)} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
