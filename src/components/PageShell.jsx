import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PageShell({ title, children }) {
  return (
    <div className="min-h-screen bg-paper flex flex-col items-center px-6 sm:px-8 pt-6 sm:pt-8 pb-10">
      <div className="max-w-5xl w-full flex flex-col">
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
          className="font-handwritten text-4xl sm:text-5xl font-bold text-ink mb-7"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          {title}
        </motion.h1>

        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}
