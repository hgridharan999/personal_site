import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PageShell({ title, subtitle, children }) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-paper flex flex-col items-center px-5 sm:px-8 pt-4 pb-5">
      <div className="max-w-6xl w-full flex flex-col flex-1 min-h-0">
        <motion.div
          className="mb-2"
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

        <motion.div
          className="mb-4 shrink-0"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <h1 className="page-title-underline inline-block font-handwritten text-3xl font-bold text-ink leading-none">
            {title}
          </h1>
          {subtitle && <p className="font-body text-sm text-ink-accent mt-2">{subtitle}</p>}
        </motion.div>

        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}
