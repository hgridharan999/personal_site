import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import { useUnifiedFeed } from '../hooks/useUnifiedFeed';

export default function BlogPage() {
  const { items, loading, error, refresh } = useUnifiedFeed();

  const sourceStyles = {
    blog: 'bg-ink/10 text-ink border border-line',
    linkedin: 'bg-highlight/15 text-highlight border border-highlight/30',
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center px-6 sm:px-8 pt-6 sm:pt-8 pb-10">
      <div className="max-w-5xl w-full flex flex-col flex-1 min-h-0">

        {/* Back link */}
        <motion.div
          className="mb-5"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-body text-sm text-fade hover:text-ink-accent transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            home
          </Link>
        </motion.div>

        <motion.h1
          className="font-handwritten text-4xl lg:text-5xl font-bold text-ink mb-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          Blogs + Posts
        </motion.h1>

        <motion.p
          className="font-body text-base text-ink-accent mb-7 max-w-2xl"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          Journal essays and LinkedIn notes, merged into one timeline.
        </motion.p>

        {/* Two-column layout */}
        <div className="flex gap-8 lg:gap-10 flex-1 min-h-0 flex-col lg:flex-row">

          {/* LEFT — distilled */}
          <motion.div
            className="w-full lg:w-64 flex-shrink-0 flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <p className="font-notes text-xs text-fade tracking-widest mb-3 font-bold">me in 10 bullet points</p>
            <div className="border border-line rounded-xl bg-paper-subtle p-4 flex-1 flex flex-col gap-3 shadow-card">
              <ul className="space-y-2 font-body text-sm text-ink leading-relaxed">
                <li>• time being so limited means that you shouldn't waste time doing stuff you don't like.</li>
                <li>• your best experiences are memories shared with friends.</li>
                <li>• bias to action, choice paralysis kills 99% of solutions.</li>
                <li>• become someone who loves risk-taking.</li>
                <li>• health outweighs all other priorities.</li>
                <li>• potential is the worst thing you can have: it prevents you from maximizing effort.</li>
                <li>• derealization is a bottom 5 experience all time.</li>
                <li>• literally everyone around you is underappreciative of the things they have.</li>
                <li>• not knowing what comes after death should be the scariest thing you ever think about.</li>
                <li>• human connection is the single most undervalued experience of our time.</li>
              </ul>
            </div>
          </motion.div>

          {/* RIGHT — subscribe + posts */}
          <div className="flex-1 flex flex-col gap-5 min-h-0">

            {/* Feed controls */}
            <motion.div
              className="border border-line rounded-xl bg-paper-subtle p-4 sm:p-5 flex-shrink-0 shadow-card"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="font-body text-sm text-ink-accent">
                  newest first, across every place I publish
                </p>
                <button
                  onClick={refresh}
                  className="inline-flex items-center gap-1.5 font-body text-xs text-fade hover:text-ink-accent transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  refresh
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="font-notes text-[11px] uppercase tracking-[0.18em] text-fade">sources</span>
                <span className={`px-2 py-0.5 rounded-full font-notes text-xs ${sourceStyles.blog}`}>blog</span>
                <span className={`px-2 py-0.5 rounded-full font-notes text-xs ${sourceStyles.linkedin}`}>linkedin</span>
              </div>
            </motion.div>

            {/* Feed */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
              {loading ? (
                <p className="font-body text-sm text-fade">Loading timeline...</p>
              ) : error ? (
                <div className="border border-line rounded-md p-4">
                  <p className="font-body text-sm text-ink">Could not load this feed.</p>
                  <p className="font-body text-xs text-fade mt-1">{error}</p>
                </div>
              ) : items.length === 0 ? (
                <p className="font-body text-sm text-fade">No posts yet. Check back soon.</p>
              ) : (
                <div className="space-y-3 pb-1">
                  {items.map((item, i) => (
                    <motion.article
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.06, duration: 0.35 }}
                      className="border border-line rounded-xl bg-paper/80 p-4 sm:p-5 shadow-card"
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        {item.internalSlug ? (
                          <Link
                            to={`/blog/${item.internalSlug}`}
                            className="font-handwritten text-xl sm:text-2xl leading-tight text-ink hover:text-highlight transition-colors"
                          >
                            {item.title}
                          </Link>
                        ) : (
                          <a
                            href={item.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 font-handwritten text-xl sm:text-2xl leading-tight text-ink hover:text-highlight transition-colors"
                          >
                            {item.title}
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}

                        <p className="font-notes text-xs sm:text-sm text-fade whitespace-nowrap flex-shrink-0">{item.displayDate}</p>
                      </div>

                      <p className="font-body text-[15px] text-ink leading-relaxed mb-3">{item.excerpt}</p>

                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="w-full max-w-sm rounded-md border border-line object-cover mb-2"
                          style={{ maxHeight: '220px' }}
                        />
                      )}

                      <span className={`inline-flex px-2 py-0.5 rounded-full font-notes text-xs ${sourceStyles[item.source] || sourceStyles.blog}`}>
                        {item.sourceLabel || item.source}
                      </span>
                    </motion.article>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
