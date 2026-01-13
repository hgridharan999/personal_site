import { motion } from 'framer-motion';
import { Github, Linkedin, Download } from 'lucide-react';
import { CoffeeDoodle } from './HandDrawnElements';

const Footer = () => {
  return (
    <footer id="footer" className="relative py-16 px-6 mt-24">
      {/* Hand-drawn dividing line */}
      <div className="max-w-7xl mx-auto mb-12">
        <svg
          width="100%"
          height="8"
          viewBox="0 0 1200 8"
          fill="none"
          preserveAspectRatio="none"
        >
          <motion.path
            d="M4 4Q300 2 600 4T1196 5"
            stroke="#D4CFC4"
            strokeWidth="2.5"
            strokeDasharray="12 8"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Left: Social links */}
          <div className="flex items-center gap-6">
            <a
              href="https://www.linkedin.com/in/harigridharan1/"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 transition-transform hover:-translate-y-1"
            >
              <div className="p-2 bg-ink-accent/10 rounded-full group-hover:bg-ink-accent/20 transition-colors">
                <Linkedin className="w-5 h-5 text-ink-accent" />
              </div>
              <span className="font-handwritten text-lg text-ink-accent group-hover:text-ink transition-colors">
                LinkedIn
              </span>
            </a>

            <a
              href="https://github.com/hgridharan999"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 transition-transform hover:-translate-y-1"
            >
              <div className="p-2 bg-ink-accent/10 rounded-full group-hover:bg-ink-accent/20 transition-colors">
                <Github className="w-5 h-5 text-ink-accent" />
              </div>
              <span className="font-handwritten text-lg text-ink-accent group-hover:text-ink transition-colors">
                GitHub
              </span>
            </a>

            <a
              href="/resume.pdf"
              download
              className="group flex items-center gap-2 transition-transform hover:-translate-y-1"
            >
              <div className="p-2 bg-highlight/20 rounded-full group-hover:bg-highlight/30 transition-colors">
                <Download className="w-5 h-5 text-highlight" />
              </div>
              <span className="font-handwritten text-lg text-highlight group-hover:text-ink transition-colors">
                Resume
              </span>
            </a>
          </div>

          {/* Center: Contact and copyright */}
          <div className="flex items-center gap-3">
            <p className="font-handwritten text-lg text-fade">
              let's talk - email: hg532@cornell.edu . made by hari gridharan 2026
            </p>
          </div>
        </div>

        {/* Small ink splatter decoration */}
        <div className="mt-8 flex justify-center gap-8 opacity-20">
          <div className="w-2 h-2 bg-ink rounded-full" />
          <div className="w-1.5 h-1.5 bg-ink rounded-full" />
          <div className="w-2.5 h-2.5 bg-ink rounded-full" />
          <div className="w-1.5 h-1.5 bg-ink rounded-full" />
          <div className="w-2 h-2 bg-ink rounded-full" />
        </div>
      </div>
    </footer>
  );
};

export default Footer;
