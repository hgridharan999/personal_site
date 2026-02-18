import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getAllPosts } from '../blog/index.js';
import PageShell from '../components/PageShell';

export default function BlogPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllPosts().then((p) => {
      setPosts(p);
      setLoading(false);
    });
  }, []);

  return (
    <PageShell title="Notes">
      {loading ? (
        <p className="font-body text-sm text-fade">Loading...</p>
      ) : (
        <div className="max-w-2xl space-y-3">
          {posts.map((post, i) => (
            <motion.article
              key={post.slug}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.06, duration: 0.35 }}
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
    </PageShell>
  );
}
