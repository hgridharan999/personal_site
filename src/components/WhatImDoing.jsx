import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { MapPin, Briefcase } from 'lucide-react';

const AdobeLogo = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ width: 44, height: 44 }}>
    <path d="M14.86 3H23v19zM9.14 3H1v19zM11.992 9.998L17.182 22h-3.394l-1.549-3.813h-3.79z" fill="#EB1000" />
  </svg>
);

const CornellECLogo = () => (
  <svg width="44" height="44" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="82,43 64,76 100,76" fill="#E8B830" />
    <polygon points="82,43 118,43 100,76" fill="#F7DC6F" />
    <polygon points="118,43 100,76 136,76" fill="#F0D060" />
    <polygon points="64,76 46,109 82,109" fill="#D4A84B" />
    <polygon points="64,76 100,76 82,109" fill="#C8956E" />
    <polygon points="100,76 136,76 118,109" fill="#B5C96A" />
    <polygon points="136,76 118,109 154,109" fill="#8CBF78" />
    <polygon points="46,109 28,142 64,142" fill="#C43A57" />
    <polygon points="46,109 82,109 64,142" fill="#D95070" />
    <polygon points="118,109 154,109 136,142" fill="#40B5A0" />
    <polygon points="154,109 136,142 172,142" fill="#2A9D8F" />
    <polygon points="28,142 64,142 46,175" fill="#E06070" />
    <polygon points="64,142 46,175 82,175" fill="#D87580" />
    <polygon points="64,142 100,142 82,175" fill="#E0A090" />
    <polygon points="100,142 82,175 118,175" fill="#D8C0A0" />
    <polygon points="100,142 136,142 118,175" fill="#A0C8A0" />
    <polygon points="136,142 118,175 154,175" fill="#50B8A0" />
    <polygon points="136,142 172,142 154,175" fill="#30A090" />
    <polygon points="100,76 64,142 136,142" fill="white" />
  </svg>
);

const ArmadaLogo = () => (
  <img src="https://armada.build/ship.png" alt="Cornell Armada" style={{ width: 44, height: 44 }} className="object-contain" />
);

const DTILogo = () => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ width: 44, height: 44 }}>
    <circle cx="50" cy="50" r="48" fill="#111111" />
    {/* C arc — open on the right, ~270 degrees */}
    <path d="M 71 27 A 30 30 0 1 0 71 73" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" />
    {/* Upward arrow */}
    <line x1="50" y1="33" x2="50" y2="67" stroke="white" strokeWidth="6" strokeLinecap="round" />
    <path d="M 39 45 L 50 33 L 61 45" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const experiencesData = [
  {
    title: "AI/Strategy Consultant (Contract)",
    company: "Adobe",
    location: "Remote",
    period: "Jan 2025 - Present",
    Logo: AdobeLogo,
    description: "Competitive analysis of AI tools across model training, performance, and market adoption. Developing strategic briefs on model-optimized architecture for board presentation and IT leadership.",
  },
  {
    title: "Operations Lead",
    company: "Cornell Entrepreneurship Club",
    location: "Ithaca, NY",
    period: "Sep 2025 - Present",
    Logo: CornellECLogo,
    description: "Built ML apps, full-stack platforms, and geospatial tools. Organized YC speaker series (150+ attendees), partnered with unicorns and venture-backed startups, generated 140k+ views on social media.",
  },
  {
    title: "Builder",
    company: "Cornell Armada",
    location: "Ithaca, NY",
    period: "Feb 2026 - Present",
    Logo: ArmadaLogo,
    description: "Cornell's most hands-on founder community — invite-only, YC-advised, and built around shipping over talking. Weekly sprint cycles with full accountability; same cohort produced 70% of Cornell's YC S25 admits.",
  },
  {
    title: "Business Analyst",
    company: "Cornell Digital Tech and Innovation (DTI)",
    location: "Ithaca, NY",
    period: "Nov 2025 - Present",
    Logo: DTILogo,
    description: "Content strategy and market analysis for products serving 15,000+ Cornell students. Organized team events and fundraisers for 70+ members.",
  },
];

const ExperienceCard = ({ experience, index }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const { Logo } = experience;

  return (
    <motion.div
      ref={ref}
      className="border-b border-line pb-4 last:border-0"
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.08, ease: "easeOut" }}
    >
      <div className="flex gap-4">
        {/* Logo column */}
        <div className="flex-shrink-0 flex items-center">
          {Logo && <Logo />}
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-4 mb-1">
            <h3 className="font-handwritten text-xl font-bold text-ink">{experience.title}</h3>
            <p className="font-notes text-sm text-fade whitespace-nowrap flex-shrink-0">{experience.period}</p>
          </div>

          <div className="flex flex-wrap gap-4 font-body text-sm text-ink-accent mb-1.5">
            <span className="flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />
              {experience.company}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {experience.location}
            </span>
          </div>
          <p className="font-body text-sm text-ink leading-relaxed">{experience.description}</p>
        </div>
      </div>
    </motion.div>
  );
};

const WhatImDoing = () => {
  return (
    <section id="doing" className="py-2 max-w-3xl mx-auto w-full">
      <div className="space-y-3">
        {experiencesData.map((experience, index) => (
          <ExperienceCard key={index} experience={experience} index={index} />
        ))}
      </div>
    </section>
  );
};

export default WhatImDoing;
