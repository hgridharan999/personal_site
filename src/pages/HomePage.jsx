import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Linkedin, Github, Mail, Download } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen w-full bg-paper flex items-center justify-center px-6 py-10 sm:px-8 lg:px-16">
      <div className="max-w-4xl w-full flex flex-col lg:flex-row gap-10 lg:gap-16 items-center">

        {/* LEFT — text content */}
        <div className="flex flex-col gap-6 flex-1 w-full">
          {/* Name */}
          <motion.h1
            className="text-5xl sm:text-6xl lg:text-7xl font-handwritten font-bold text-ink leading-[0.95]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            Hari Gridharan
          </motion.h1>

          {/* One-liner */}
          <motion.p
            className="font-body text-base lg:text-lg text-ink-accent max-w-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            Cornell Dyson '29 - Building ML systems, founder tools, and go-to-market experiments.
          </motion.p>

          {/* Blurb */}
          <motion.p
            className="font-body text-[15px] text-fade leading-relaxed max-w-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            Founder and operator working across AI strategy, product builds, and growth. Top 10% YC applicant with Fortune 500 consulting exposure. I like high-agency teams, fast iteration, and ambitious technical bets.
          </motion.p>

          {/* Nav links and Social in grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-1 pt-3 border-t border-line/80">
            {/* Projects */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.35 }}
            >
              <Link
                to="/projects"
                className="font-handwritten text-2xl lg:text-3xl text-ink hover:text-highlight transition-colors inline-block py-0.5"
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
                <span className="font-body text-[15px]">LinkedIn</span>
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
                className="font-handwritten text-2xl lg:text-3xl text-ink hover:text-highlight transition-colors inline-block py-0.5"
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
                <span className="font-body text-[15px]">GitHub</span>
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
                className="font-handwritten text-2xl lg:text-3xl text-ink hover:text-highlight transition-colors inline-block py-0.5"
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
                <span className="font-body text-[15px]">Email</span>
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
                className="font-handwritten text-2xl lg:text-3xl text-ink hover:text-highlight transition-colors inline-block py-0.5"
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
                <span className="font-body text-[15px]">Resume</span>
              </a>
            </motion.div>
          </div>
        </div>

        {/* RIGHT — photo */}
        <motion.div
          className="flex-shrink-0"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
        >
          <img
            src="/profile.jpg"
            alt="Hari"
            className="w-40 h-40 sm:w-48 sm:h-48 lg:w-64 lg:h-64 object-cover rounded-xl border border-line shadow-page"
          />
        </motion.div>

      </div>
    </div>
  );
}
