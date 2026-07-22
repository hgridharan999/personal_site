import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import SubShell from './SubShell';
import { PRINCIPLES } from './data';
import { useUnifiedFeed } from '../hooks/useUnifiedFeed';

const thesisLink = (
  <Link to="/thesis" data-hot className="asc-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--amber)', fontStyle: 'normal' }}>
    Investment thesis <ArrowUpRight size={16} />
  </Link>
);

const isEssay = (it) => it.source === 'blog' && it.internalSlug;

function renderItem(it, i) {
  const internal = isEssay(it);
  const Comp = internal ? Link : 'a';
  const linkProps = internal
    ? { to: `/blog/${it.internalSlug}` }
    : { href: it.externalUrl || '#', target: '_blank', rel: 'noopener noreferrer' };
  return (
    <Comp key={it.id || i} {...linkProps} data-hot className="asc-feed-item">
      <span className="asc-mono" style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>{it.displayDate}</span>
      <span className="asc-feed-title">{it.title}</span>
      <ArrowUpRight size={16} style={{ opacity: 0.5, alignSelf: 'center' }} />
    </Comp>
  );
}

export default function AscentTheses() {
  const { items, loading } = useUnifiedFeed();
  const essays = items.filter(isEssay);
  const posts = items.filter((it) => !isEssay(it));

  return (
    <SubShell index="04" title="Theses" current="Theses" subtitle={thesisLink}>
      <div className="asc-theses">

        {/* left — me in 10 bullet points */}
        <div className="asc-col" style={{ overflow: 'hidden' }}>
          <span className="asc-mono asc-amber">Me in 10 bullet points</span>
          <ol style={{ marginTop: 12, listStyle: 'none', padding: 0 }}>
            {PRINCIPLES.map((p, i) => (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: 16, borderTop: '1px solid var(--line-2)', padding: 'clamp(6px, 1vh, 10px) 0' }}>
                <span className="asc-mono" style={{ color: 'var(--faint)' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: 'var(--display)', fontWeight: 500, fontSize: 'clamp(13px, 1.15vw, 16px)', lineHeight: 1.3 }}>{p}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* right — essays on top, posts below */}
        <div className="asc-col">
          {loading && <div className="asc-mono" style={{ color: 'var(--faint)', padding: '20px 0' }}>Loading the record…</div>}

          <section>
            <span className="asc-mono asc-amber">Essays</span>
            <div style={{ marginTop: 12 }}>{essays.map(renderItem)}</div>
          </section>

          <section style={{ marginTop: 'clamp(22px, 3.4vh, 40px)' }}>
            <span className="asc-mono asc-amber">Posts</span>
            <div style={{ marginTop: 12 }}>{posts.map(renderItem)}</div>
          </section>
        </div>
      </div>
    </SubShell>
  );
}
