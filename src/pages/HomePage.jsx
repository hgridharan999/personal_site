import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Linkedin, Github, Mail, Download } from 'lucide-react';

const NAME = 'Hari Gridharan';

const letterVariants = {
  hidden: { opacity: 0, y: -28, rotate: -8 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    rotate: 0,
    transition: {
      delay: i * 0.045,
      type: 'spring',
      stiffness: 320,
      damping: 18,
    },
  }),
};

export default function HomePage() {
  return (
    <div className="min-h-screen w-full bg-paper flex items-center justify-center px-6 py-10 sm:px-8 lg:px-16">
      <div className="max-w-4xl w-full flex flex-col lg:flex-row gap-8 lg:gap-12 items-center">

        {/* LEFT — text content */}
        <div className="flex flex-col gap-6 flex-1 w-full">
          {/* Name — letter-by-letter drop */}
          <h1 className="text-5xl sm:text-6xl font-handwritten font-bold text-ink leading-[0.95]"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
            {NAME.split('').map((char, i) => (
              <motion.span
                key={i}
                custom={i}
                variants={letterVariants}
                initial="hidden"
                animate="visible"
                style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : 'normal' }}
              >
                {char === ' ' ? ' ' : char}
              </motion.span>
            ))}
          </h1>

          {/* One-liner */}
          <motion.p
            className="font-body text-base lg:text-lg text-ink-accent max-w-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            Cornell Dyson '29 · Dyson Scholar · Building AI products, founder tools, and go-to-market experiments.
          </motion.p>

          {/* Blurb */}
          <motion.p
            className="font-body text-base text-fade leading-relaxed max-w-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            Founder and operator at the intersection of AI strategy, product, and growth. Advised Fortune 500 IT leaders at Adobe, ranked top 10% among 20,000+ YC applicants, and drove 500k+ views as President of Cornell's Entrepreneurship Club. I like high-agency teams, fast iteration, and building things that feel personal, useful, and a little bit obsessive.
          </motion.p>

          {/* Nav links and Social in grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1 pt-4 border-t border-line/80">
            {/* Projects */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.35 }}
            >
              <Link
                to="/projects"
                className="nav-sweep font-handwritten text-2xl lg:text-3xl text-ink hover:text-highlight transition-colors inline-block py-0.5"
              >
                Projects
              </Link>
            </motion.div>
            {/* LinkedIn */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.35 }}
            >
              <a
                href="https://www.linkedin.com/in/harigridharan1/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-fade hover:text-ink-accent transition-colors py-0.5"
              >
                <Linkedin className="w-4 h-4 shrink-0" />
                <span className="font-body text-base">LinkedIn</span>
              </a>
            </motion.div>

            {/* Work */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.57, duration: 0.35 }}
            >
              <Link
                to="/work"
                className="nav-sweep font-handwritten text-2xl lg:text-3xl text-ink hover:text-highlight transition-colors inline-block py-0.5"
              >
                Work
              </Link>
            </motion.div>
            {/* GitHub */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.57, duration: 0.35 }}
            >
              <a
                href="https://github.com/hgridharan999"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-fade hover:text-ink-accent transition-colors py-0.5"
              >
                <Github className="w-4 h-4 shrink-0" />
                <span className="font-body text-base">GitHub</span>
              </a>
            </motion.div>

            {/* Climbing */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.64, duration: 0.35 }}
            >
              <Link
                to="/climbing"
                className="nav-sweep font-handwritten text-2xl lg:text-3xl text-ink hover:text-highlight transition-colors inline-block py-0.5"
              >
                Climbing
              </Link>
            </motion.div>
            {/* Email */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.64, duration: 0.35 }}
            >
              <a
                href="mailto:hg532@cornell.edu"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-fade hover:text-ink-accent transition-colors py-0.5"
              >
                <Mail className="w-4 h-4 shrink-0" />
                <span className="font-body text-base">Email</span>
              </a>
            </motion.div>

            {/* Blogs + Posts */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.71, duration: 0.35 }}
            >
              <Link
                to="/blog"
                className="nav-sweep font-handwritten text-2xl lg:text-3xl text-ink hover:text-highlight transition-colors inline-block py-0.5"
              >
                Blogs + Posts
              </Link>
            </motion.div>
            {/* Resume */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.71, duration: 0.35 }}
            >
              <a
                href="/Gridharan_Hari_Resume.pdf"
                download
                className="flex items-center gap-1.5 text-fade hover:text-highlight transition-colors py-0.5"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span className="font-body text-base">Resume</span>
              </a>
            </motion.div>
          </div>
        </div>

        {/* RIGHT — polaroid photo */}
        <motion.div
          className="flex-shrink-0"
          initial={{ opacity: 0, scale: 0.94, rotate: -3 }}
          animate={{ opacity: 1, scale: 1, rotate: 2 }}
          transition={{ delay: 0.4, duration: 0.7, ease: 'easeOut' }}
          whileHover={{ rotate: 0, scale: 1.03, transition: { duration: 0.25 } }}
          style={{ cursor: 'default' }}
        >
          {/* polaroid frame */}
          <div style={{
            background: '#FEFCF8',
            padding: '10px 10px 32px 10px',
            boxShadow: '0 6px 28px rgba(44,44,44,0.18), 0 2px 6px rgba(44,44,44,0.10)',
            borderRadius: '2px',
            border: '1px solid #E8E2D6',
          }}>
            <img
              src="/profile.jpg"
              alt="Hari"
              className="profile-image object-cover"
              style={{ width: '160px', height: '160px', display: 'block' }}
            />
            <p style={{
              textAlign: 'center',
              fontFamily: "'Caveat', cursive",
              fontSize: '13px',
              color: '#9A8F80',
              marginTop: '8px',
              letterSpacing: '0.02em',
            }}>hari :)</p>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
