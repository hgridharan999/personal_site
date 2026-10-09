import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import SubShell from './SubShell';
import { PRINCIPLES, PUBLISHED_THESES } from './data';
import { useUnifiedFeed } from '../hooks/useUnifiedFeed';

const thesisLink = (
  <Link to="/thesis" data-hot className="asc-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--amber)', fontStyle: 'normal' }}>
    Investment thesis <ArrowUpRight size={16} />
  </Link>
);

const isEssay = (it) => it.source === 'blog' && it.internalSlug;

// Shared row body for essays and Medium theses; `kind` stacks under the date.
function FeedRow({ date, title, kind }) {
  return (
    <>
      <span className="asc-mono" style={{ color: 'var(--faint)', whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>{date}</span>
        {kind && <span>{kind}</span>}
      </span>
      <span className="asc-feed-title">{title}</span>
      <ArrowUpRight size={16} style={{ opacity: 0.5, alignSelf: 'center' }} />
    </>
  );
}

function renderItem(it, i) {
  return (
    <Link key={it.id || i} to={`/blog/${it.internalSlug}`} data-hot className="asc-feed-item">
      <FeedRow date={it.displayDate} title={it.title} />
    </Link>
  );
}

function renderThesis(t) {
  return (
    <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" data-hot className="asc-feed-item">
      <FeedRow date={t.date} title={t.title} kind={t.kind} />
    </a>
  );
}

export default function AscentTheses() {
  const { items, loading } = useUnifiedFeed();
  const essays = items.filter(isEssay);

  return (
    <SubShell index="04" title="Theses" current="Theses" instrument="theses">
      <div className="asc-theses">

        {/* left — me in 10 bullet points */}
        <div className="asc-col asc-principles">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span className="asc-mono asc-amber">Me in 10 bullet points</span>
            {thesisLink}
          </div>
          <ol style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
            {PRINCIPLES.map((p, i) => (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: 16, borderTop: '1px solid var(--line-2)', padding: 'clamp(6px, 1vh, 10px) 0' }}>
                <span className="asc-mono" style={{ color: 'var(--faint)' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: 'var(--display)', fontWeight: 500, fontSize: 'clamp(13px, 1.15vw, 16px)', lineHeight: 1.3 }}>{p}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* right — select essays, then investment & research theses on Medium */}
        <div className="asc-col">
          {loading && <div className="asc-mono" style={{ color: 'var(--faint)', padding: '20px 0' }}>Loading the record…</div>}

          <section>
            <span className="asc-feed-head">Select essays</span>
            <div style={{ marginTop: 12 }}>{essays.map(renderItem)}</div>
          </section>

          <section style={{ marginTop: 'clamp(24px, 4vh, 40px)' }}>
            <span className="asc-feed-head">Investment &amp; research theses</span>
            <div style={{ marginTop: 12 }}>
              {PUBLISHED_THESES.length > 0
                ? PUBLISHED_THESES.map(renderThesis)
                : <div className="asc-mono" style={{ color: 'var(--faint)', borderBottom: '1px solid var(--line-2)', padding: 'clamp(11px, 1.7vh, 18px) 0' }}>Coming soon on Medium.</div>}
            </div>
          </section>
        </div>
      </div>
    </SubShell>
  );
}
