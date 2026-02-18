import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Linkedin, Github, Mail, Download } from 'lucide-react';

const navLinks = [
  { label: 'Projects', to: '/projects' },
  { label: 'Work',     to: '/work'     },
  { label: 'Climbing', to: '/climbing' },
  { label: 'Notes',    to: '/blog'     },
];

const socialLinks = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/harigridharan1/', Icon: Linkedin },
  { label: 'GitHub',   href: 'https://github.com/hgridharan999',             Icon: Github  },
  { label: 'Email',    href: 'mailto:hg532@cornell.edu',                      Icon: Mail    },
];

export default function HomePage() {
  return (
    <div className="h-screen w-screen bg-paper flex items-center justify-center overflow-hidden px-8 lg:px-16">
      <div className="max-w-5xl w-full flex flex-col lg:flex-row gap-12 lg:gap-24 items-center lg:items-center">

        {/* LEFT — text content */}
        <div className="flex flex-col gap-5 flex-1">
          {/* Name */}
          <motion.h1
            className="text-6xl lg:text-7xl font-handwritten font-bold text-ink leading-none"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            Hari Gridharan
          </motion.h1>

          {/* One-liner */}
          <motion.p
            className="font-body text-base lg:text-lg text-ink-accent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            Cornell Dyson '29 · Building ML systems and startups.
          </motion.p>

          {/* Nav links */}
          <nav className="flex flex-col gap-0.5 mt-2">
            {navLinks.map(({ label, to }, i) => (
              <motion.div
                key={to}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.07, duration: 0.35 }}
              >
                <Link
                  to={to}
                  className="font-handwritten text-2xl lg:text-3xl text-ink hover:text-highlight transition-colors inline-block py-0.5"
                >
                  {label}
                </Link>
              </motion.div>
            ))}
          </nav>

          {/* Social + resume */}
          <motion.div
            className="flex flex-wrap gap-5 items-center mt-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85, duration: 0.4 }}
          >
            {socialLinks.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-fade hover:text-ink-accent transition-colors"
              >
                <Icon className="w-4 h-4" />
                <span className="font-body text-sm">{label}</span>
              </a>
            ))}

            <a
              href="/resume.pdf"
              download
              className="flex items-center gap-1.5 text-fade hover:text-highlight transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="font-body text-sm">Resume</span>
            </a>
          </motion.div>
        </div>

        {/* RIGHT — photo (desktop only) */}
        <motion.div
          className="flex-shrink-0 hidden lg:block"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
        >
          <img
            src="/profile.jpg"
            alt="Hari"
            className="w-48 h-48 object-cover rounded-xl border border-line shadow-page"
          />
        </motion.div>

      </div>
    </div>
  );
}
