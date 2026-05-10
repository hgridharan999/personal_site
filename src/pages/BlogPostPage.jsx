import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getPostBySlug } from '../blog/index.js';

export default function BlogPostPage() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getPostBySlug(slug).then((result) => {
      if (result) setPost(result);
      else setNotFound(true);
    });
  }, [slug]);

  if (notFound) {
    return (
      <div className="h-screen bg-paper flex flex-col items-center justify-center gap-4">
        <p className="font-handwritten text-3xl text-ink">Post not found.</p>
        <Link to="/blog" className="font-body text-sm text-ink-accent hover:text-ink transition-colors">
          ← back to blogs + posts
        </Link>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="h-screen bg-paper flex items-center justify-center">
        <p className="font-body text-sm text-fade">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper px-6 sm:px-8 py-10 sm:py-12">
      {/* Back nav */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 font-body text-sm text-fade hover:text-ink-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          blogs + posts
        </Link>
      </motion.div>

      <div className="max-w-3xl">
        {/* Title */}
        <motion.h1
          className="font-handwritten text-5xl font-bold text-ink mb-3 leading-tight"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          {post.frontmatter.title}
        </motion.h1>

        {/* Date */}
        <motion.p
          className="font-body text-xs sm:text-sm text-fade mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          {post.frontmatter.date}
        </motion.p>

        {/* Body */}
        <motion.article
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="font-body text-ink leading-relaxed space-y-4 [&_h2]:font-handwritten [&_h2]:text-3xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:font-handwritten [&_h3]:text-2xl [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-base [&_p]:leading-relaxed [&_a]:text-highlight [&_a]:underline [&_a:hover]:text-ink [&_code]:bg-line/50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_blockquote]:border-l-2 [&_blockquote]:border-ink-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-fade"
        >
          <ReactMarkdown>{post.content}</ReactMarkdown>
        </motion.article>
      </div>
    </div>
  );
}
