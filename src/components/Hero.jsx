import { motion } from 'framer-motion';
import { WobblyUnderline, CoffeeDoodle, MountainDoodle } from './HandDrawnElements';
import { Github, Linkedin, Download, Mountain, Briefcase, Code } from 'lucide-react';

const Hero = () => {
  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 py-20 lg:py-32 overflow-hidden">
      {/* Subtle ink splatters */}
      <div className="ink-splatter top-[15%] left-[10%]" style={{ animationDelay: '2s' }} />
      <div className="ink-splatter top-[25%] right-[15%]" style={{ animationDelay: '2.5s' }} />
      <div className="ink-splatter bottom-[30%] left-[20%]" style={{ animationDelay: '3s' }} />

      <div className="max-w-6xl w-full mx-auto">
        <div className="grid lg:grid-cols-[1.5fr,1fr] gap-12 lg:gap-20 items-center">
          {/* Left: Text content */}
          <div className="space-y-6">
            {/* Name with animated underline and doodle */}
            <div className="relative inline-block">
              <motion.h1
                className="text-6xl md:text-7xl lg:text-8xl font-handwritten font-bold text-ink mb-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                Hi, I'm Hari
              </motion.h1>

              {/* Wobbly underline */}
              <WobblyUnderline delay={1.2} />

              {/* Small doodle - repositioned below name */}
              <MountainDoodle
                delay={2.5}
                className="absolute -bottom-6 -right-8 opacity-40"
              />
            </div>

            {/* Subtitle */}
            <motion.div
              className="space-y-2 pt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.5, ease: "easeOut" }}
            >
              <p className="text-2xl md:text-3xl font-handwritten text-ink-accent">
                Cornell '29 • Dyson AEM • AI Minor
              </p>
            </motion.div>

            {/* About paragraph - smaller and tighter */}
            <motion.div
              className="max-w-xl pt-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.8, ease: "easeOut" }}
            >
              <p className="text-base md:text-lg font-body text-ink leading-relaxed">
                Building ML systems and startups. Co-founded a YC-applicant fintech startup (top 10%). Exploring where AI meets business strategy—and climbing 14ers along the way.
              </p>
            </motion.div>

            {/* Social links with sketched style */}
            <motion.div
              className="flex flex-wrap gap-6 items-center pt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 2.1 }}
            >
              {/* LinkedIn */}
              <a
                href="https://www.linkedin.com/in/harigridharan1/"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 transition-transform hover:-translate-y-1"
              >
                <div className="p-2 bg-ink-accent/10 rounded-full group-hover:bg-ink-accent/20 transition-colors">
                  <Linkedin className="w-5 h-5 text-ink-accent" />
                </div>
                <span className="font-handwritten text-xl text-ink-accent group-hover:text-ink transition-colors">
                  LinkedIn
                </span>
              </a>

              {/* GitHub */}
              <a
                href="https://github.com/hgridharan999"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 transition-transform hover:-translate-y-1"
              >
                <div className="p-2 bg-ink-accent/10 rounded-full group-hover:bg-ink-accent/20 transition-colors">
                  <Github className="w-5 h-5 text-ink-accent" />
                </div>
                <span className="font-handwritten text-xl text-ink-accent group-hover:text-ink transition-colors">
                  GitHub
                </span>
              </a>

              {/* Let's chat button */}
              <button
                onClick={() => scrollToSection('footer')}
                className="group flex items-center gap-2 transition-transform hover:-translate-y-1"
              >
                <div className="p-2 bg-ink-accent/10 rounded-full group-hover:bg-ink-accent/20 transition-colors">
                  <CoffeeDoodle delay={2.5} className="" />
                </div>
                <span className="font-handwritten text-xl text-ink-accent group-hover:text-ink transition-colors">
                  let's chat
                </span>
              </button>
            </motion.div>

            {/* Navigation buttons - three journal-style buttons */}
            <motion.div
              className="flex flex-wrap gap-4 pt-8"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 2.3 }}
            >
              {/* See what I'm doing */}
              <button
                onClick={() => scrollToSection('doing')}
                className="group relative px-6 py-3 bg-paper border-2 border-ink-accent hover:bg-ink-accent/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-page"
                style={{
                  borderRadius: '20px 18px 22px 16px',
                  transform: 'rotate(-0.5deg)'
                }}
              >
                <div className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-ink-accent" />
                  <span className="font-handwritten text-lg font-bold text-ink-accent">
                    See what I'm doing
                  </span>
                </div>
                {/* Hand-drawn arrow */}
                <motion.svg
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                  width="20"
                  height="12"
                  viewBox="0 0 20 12"
                  fill="none"
                >
                  <path d="M10 2v8m-4-3l4 4 4-4" stroke="#6B7A5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </motion.svg>
              </button>

              {/* See what I've built */}
              <button
                onClick={() => scrollToSection('projects')}
                className="group relative px-6 py-3 bg-paper border-2 border-highlight hover:bg-highlight/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-page"
                style={{
                  borderRadius: '18px 20px 16px 22px',
                  transform: 'rotate(0.5deg)'
                }}
              >
                <div className="flex items-center gap-2">
                  <Code className="w-5 h-5 text-highlight" />
                  <span className="font-handwritten text-lg font-bold text-highlight">
                    See what I've built
                  </span>
                </div>
                <motion.svg
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                  width="20"
                  height="12"
                  viewBox="0 0 20 12"
                  fill="none"
                >
                  <path d="M10 2v8m-4-3l4 4 4-4" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </motion.svg>
              </button>

              {/* See what I've climbed */}
              <a
                href="/climbing"
                className="group relative px-6 py-3 bg-paper border-2 border-ink hover:bg-ink/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-page"
                style={{
                  borderRadius: '22px 16px 20px 18px',
                  transform: 'rotate(-0.3deg)'
                }}
              >
                <div className="flex items-center gap-2">
                  <Mountain className="w-5 h-5 text-ink" />
                  <span className="font-handwritten text-lg font-bold text-ink">
                    See what I've climbed
                  </span>
                </div>
                <motion.svg
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                  width="20"
                  height="12"
                  viewBox="0 0 20 12"
                  fill="none"
                >
                  <path d="M10 2v8m-4-3l4 4 4-4" stroke="#2C2C2C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </motion.svg>
              </a>
            </motion.div>
          </div>

          {/* Right: Photo with polaroid style */}
          <motion.div
            className="relative"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: 1,
              delay: 2.0,
              ease: [0.34, 1.56, 0.64, 1]
            }}
          >
            {/* Polaroid frame */}
            <div className="relative bg-white p-4 pb-16 shadow-photo -rotate-3 hover:rotate-0 transition-transform duration-300">
              {/* Photo placeholder - replace with actual photo */}
              <div className="aspect-square bg-gradient-to-br from-line to-paper relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center text-fade font-handwritten text-2xl">
                  [Your Photo Here]
                </div>
              </div>

              {/* Date stamp on polaroid */}
              <div className="absolute bottom-4 left-4 font-notes text-sm text-fade">
                Dec 2024
              </div>

              {/* Corner tape pieces */}
              <motion.div
                className="corner-tape top-0 left-0 rotate-0"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 2.8, duration: 0.3, ease: "backOut" }}
              />
              <motion.div
                className="corner-tape top-0 right-0 -rotate-90"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 2.9, duration: 0.3, ease: "backOut" }}
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Resume download button - journal tab style (fixed position) */}
      <motion.a
        href="/resume.pdf"
        download
        className="fixed top-32 right-0 z-50 hidden lg:flex items-center gap-2 px-5 py-3 bg-highlight text-paper shadow-page hover:shadow-page-hover transition-all duration-300 hover:translate-x-[-4px] group origin-right"
        style={{
          borderRadius: '8px 0 0 8px',
          transform: 'rotate(0deg)',
          writingMode: 'horizontal-tb'
        }}
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
          duration: 0.8,
          delay: 2.5,
          ease: [0.34, 1.56, 0.64, 1]
        }}
      >
        <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
        <span className="font-handwritten text-lg font-bold">Resume</span>

        {/* Hand-drawn border decoration */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 120 50" preserveAspectRatio="none">
          <motion.path
            d="M2 2h118v46H2z"
            stroke="#B36A4C"
            strokeWidth="1"
            fill="none"
            strokeDasharray="4 2"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, delay: 2.8 }}
          />
        </svg>
      </motion.a>

      {/* Mobile resume button */}
      <motion.a
        href="/resume.pdf"
        download
        className="lg:hidden fixed bottom-8 right-8 z-50 flex items-center gap-2 px-6 py-3 bg-highlight text-paper shadow-page hover:shadow-page-hover transition-all duration-300 group"
        style={{
          borderRadius: '20px 18px 22px 16px',
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.5, duration: 0.5 }}
      >
        <Download className="w-5 h-5" />
        <span className="font-handwritten text-lg font-bold">Resume</span>
      </motion.a>
    </section>
  );
};

export default Hero;
