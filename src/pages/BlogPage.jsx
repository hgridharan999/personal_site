import { Link } from 'react-router-dom';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink, RefreshCw, ArrowRight } from 'lucide-react';
import { useUnifiedFeed } from '../hooks/useUnifiedFeed';

// ── Editable: your headline investment thesis lives here ──────────────
const INVESTMENT_THESIS = {
  headline: 'What I’m betting on',
  body:
    'The next decade belongs to AI-native founders building the tooling, infrastructure, and operating layers that incumbents can’t. I back high-agency teams at the intersection of applied AI, founder infrastructure, and climate & hard-tech systems — products that feel personal, compound with usage, and turn small teams into outsized outcomes.',
  tags: ['Applied AI', 'Founder tooling', 'Climate & hard-tech'],
};

const PRINCIPLES = [
  'Time is limited — don’t waste it on things you don’t love.',
  'Your best experiences are memories shared with friends.',
  'Bias to action; choice paralysis kills 99% of solutions.',
  'Become someone who loves risk-taking.',
  'Health outweighs every other priority.',
  'Potential is the worst thing to have — it caps effort.',
  'Everyone around you is underappreciative of what they have.',
  'Human connection is the most undervalued experience of our time.',
];

export default function BlogPage() {
  const { items, loading, error, refresh } = useUnifiedFeed();
  const [sourceFilter, setSourceFilter] = useState('all');

  const filteredItems = sourceFilter === 'all' ? items : items.filter((item) => item.source === sourceFilter);

  const sourceStyles = {
    blog: 'bg-ink/10 text-ink border border-line',
    linkedin: 'bg-line/25 text-ink border border-line',
  };

  const filterOptions = [
    { key: 'all', label: 'all' },
    { key: 'blog', label: 'essays' },
    { key: 'linkedin', label: 'notes' },
  ];

  return (
    <div className="h-[100dvh] overflow-hidden bg-paper flex flex-col items-center px-5 sm:px-8 pt-4 pb-5">
      <div className="max-w-6xl w-full flex flex-col flex-1 min-h-0">

        {/* Back */}
        <motion.div className="mb-2" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
          <Link to="/" className="inline-flex items-center gap-2 font-body text-sm text-fade hover:text-ink-accent transition-colors">
            <ArrowLeft className="w-4 h-4" />
            home
          </Link>
        </motion.div>

        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="mb-4 shrink-0">
          <h1 className="page-title-underline inline-block font-handwritten text-3xl font-bold text-ink leading-none">Theses</h1>
          <p className="font-body text-sm text-ink-accent mt-2">A place for my thinking — theses, essays, and notes.</p>
        </motion.div>

        {/* Feature row: Investment thesis + operating principles */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 shrink-0">
          {/* Investment thesis — featured */}
          <motion.div
            className="lg:col-span-2 relative rounded-xl border border-highlight/40 bg-highlight/[0.06] p-5 shadow-card overflow-hidden"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <span className="font-body text-[11px] uppercase tracking-[0.22em] text-highlight font-semibold">Investment Thesis</span>
            <h2 className="font-handwritten text-2xl font-bold text-ink mt-1 mb-2 leading-tight">{INVESTMENT_THESIS.headline}</h2>
            <p className="font-body text-[15px] text-ink leading-relaxed line-clamp-4">{INVESTMENT_THESIS.body}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {INVESTMENT_THESIS.tags.map((t) => (
                <span key={t} className="px-2.5 py-0.5 rounded-full font-body text-xs text-ink-accent border border-line bg-paper/60">{t}</span>
              ))}
            </div>
          </motion.div>

          {/* Operating principles */}
          <motion.div
            className="rounded-xl border border-line bg-paper-subtle p-4 shadow-card flex flex-col min-h-0"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <span className="font-body text-[11px] uppercase tracking-[0.2em] text-fade font-semibold mb-2">Operating Principles</span>
            <ul className="space-y-1.5 font-body text-[13px] text-ink leading-snug overflow-hidden">
              {PRINCIPLES.slice(0, 6).map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-highlight">·</span>
                  <span className="line-clamp-1">{p}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Essays & notes */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
            <div className="flex items-center gap-3">
              <span className="font-body text-[11px] uppercase tracking-[0.2em] text-fade font-semibold">Essays &amp; Notes</span>
              <div className="flex items-center gap-1.5">
                {filterOptions.map((option) => {
                  const active = sourceFilter === option.key;
                  return (
                    <button
                      key={option.key}
                      onClick={() => setSourceFilter(option.key)}
                      className={`px-2.5 py-0.5 rounded-full font-body text-xs transition-colors border ${
                        active ? 'bg-ink text-paper border-ink' : 'bg-transparent text-fade border-line hover:text-ink hover:border-ink'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={refresh} className="inline-flex items-center gap-1.5 font-body text-xs text-fade hover:text-ink-accent transition-colors shrink-0">
              <RefreshCw className="w-3.5 h-3.5" />
              refresh
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {loading ? (
              <p className="font-body text-sm text-fade">Loading…</p>
            ) : filteredItems.length === 0 ? (
              <p className="font-body text-sm text-fade">No {sourceFilter === 'all' ? 'posts' : filterOptions.find((f) => f.key === sourceFilter)?.label} yet. Check back soon.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-1">
                {filteredItems.map((item, i) => (
                  <motion.article
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + i * 0.05, duration: 0.35 }}
                    className="border border-line rounded-lg bg-paper/85 p-4 shadow-card flex flex-col"
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      {item.internalSlug ? (
                        <Link to={`/blog/${item.internalSlug}`} className="font-handwritten text-lg leading-tight text-ink hover:text-highlight transition-colors">
                          {item.title}
                        </Link>
                      ) : (
                        <a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-handwritten text-lg leading-tight text-ink hover:text-highlight transition-colors">
                          {item.title}
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        </a>
                      )}
                      <span className="font-body text-[11px] text-fade whitespace-nowrap shrink-0">{item.displayDate}</span>
                    </div>

                    <p className="font-body text-[13px] text-ink leading-snug line-clamp-2 mb-2">{item.excerpt}</p>

                    <div className="flex items-center justify-between gap-2 mt-auto">
                      <span className={`inline-flex px-2 py-0.5 rounded-full font-body text-[11px] ${sourceStyles[item.source] || sourceStyles.blog}`}>
                        {item.sourceLabel || item.source}
                      </span>
                      {item.internalSlug && (
                        <Link to={`/blog/${item.internalSlug}`} className="inline-flex items-center gap-1 font-body text-xs text-ink-accent hover:text-highlight transition-colors group">
                          read
                          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                      )}
                    </div>
                  </motion.article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
