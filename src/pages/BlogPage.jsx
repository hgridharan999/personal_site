import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getAllPosts } from '../blog/index.js';

export default function BlogPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');

  useEffect(() => {
    getAllPosts().then((p) => {
      setPosts(p);
      setLoading(false);
    });
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-paper flex flex-col items-center px-8 pt-8 pb-6">
      <div className="max-w-5xl w-full flex flex-col flex-1 min-h-0">

        {/* Back link */}
        <motion.div
          className="mb-4"
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
          className="font-handwritten text-4xl font-bold text-ink mb-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          Blog
        </motion.h1>

        {/* Two-column layout */}
        <div className="flex gap-10 flex-1 min-h-0">

          {/* LEFT — distilled */}
          <motion.div
            className="w-52 flex-shrink-0 flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <p className="font-notes text-xs text-fade tracking-widest mb-4 font-bold">me in 10 bullet points</p>
            <div className="border-t border-line pt-4 flex-1 flex flex-col gap-3">
              <ul className="space-y-2 font-body text-xs text-ink leading-relaxed">
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

            {/* Subscribe */}
            <motion.div
              className="border-b border-line pb-5 flex-shrink-0"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            >
              <p className="font-body text-sm text-ink-accent mb-3">
                join some people who want to hear my thoughts
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="flex-1 bg-transparent border border-line rounded-sm px-3 py-1.5 font-body text-sm text-ink placeholder:text-fade focus:outline-none focus:border-highlight transition-colors"
                />
                <button
                  onClick={() => setEmail('')}
                  className="bg-highlight text-paper px-4 py-1.5 rounded-sm font-body text-sm hover:opacity-90 transition-opacity"
                >
                  Subscribe
                </button>
              </div>
            </motion.div>

            {/* Posts */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {loading ? (
                <p className="font-body text-sm text-fade">Loading...</p>
              ) : (
                <div className="space-y-3">
                  {posts.map((post, i) => (
                    <motion.article
                      key={post.slug}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.06, duration: 0.35 }}
                      className="flex items-baseline justify-between gap-6 border-b border-line pb-3 last:border-0"
                    >
                      <Link
                        to={`/blog/${post.slug}`}
                        className="font-handwritten text-xl text-ink hover:text-highlight transition-colors"
                      >
                        {post.title}
                      </Link>
                      <p className="font-notes text-sm text-fade whitespace-nowrap flex-shrink-0">{post.date}</p>
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
