import { motion } from 'framer-motion';
import { MapPin, Briefcase, ExternalLink } from 'lucide-react';

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

const LoadstoneLogo = () => (
  <img src="/loadstonelabs_logo.jpg" alt="Loadstone Labs" style={{ width: 44, height: 44 }} className="object-contain rounded" />
);

const WidgetFactoryLogo = () => (
  <img src="/widgetfactory_logo.jpg" alt="Widget Factory" style={{ width: 44, height: 44 }} className="object-contain rounded" />
);

const Ship1Logo = () => (
  <img src="/shipaccelerator_logo.jpg" alt="SH1P" style={{ width: 44, height: 44 }} className="object-contain rounded" />
);

const experiencesData = [
  {
    title: "AI/Strategy Consultant (Contract)",
    company: "Adobe",
    url: "https://www.adobe.com/",
    location: "Remote",
    period: "Jan 2026 – Apr 2026",
    Logo: AdobeLogo,
    description: "Advised IT leadership at Fortune 500 firms on AI product strategy tied to $1M+ enterprise contracts. Built market sizing frameworks, UX benchmarks, and positioning analyses; proposed business cases now in suite beta testing.",
  },
  {
    title: "Problem Design Engineer",
    company: "Widget Factory",
    url: "https://widgetfactory.ai/",
    location: "Remote",
    period: "Jan 2026 – Apr 2026",
    Logo: WidgetFactoryLogo,
    description: "Designed complex real-world problem sets used to evaluate frontier AI models in training environments. Benchmarked agent behavior and coordinated engineer feedback into production deployment improvements.",
  },
  {
    title: "Builder",
    company: "Cornell Armada",
    url: "https://armada.build/",
    location: "Ithaca, NY",
    period: "Jan 2026 – Present",
    Logo: ArmadaLogo,
    description: "Led high-agency projects across an AI-native suite, partnering with VCs ($200M+ AUM) at a YC-backed startup community. Built ML apps, code optimizers, full-stack platforms, drone sync systems, and the Cornell founder directory.",
  },
  {
    title: "President",
    company: "Cornell Entrepreneurship Club",
    url: "https://www.cornellentrepreneurship.com/",
    location: "Ithaca, NY",
    period: "Sep 2025 – Present",
    Logo: CornellECLogo,
    description: "Running YC speaker series for 150+ attendees, coordinating directly with founders and VC firms. Generated 500,000+ views on Instagram/LinkedIn and scouting student startups to develop investment theses.",
  },
  {
    title: "Business Analyst",
    company: "Cornell Digital Tech and Innovation (DTI)",
    url: "https://www.cornelldti.org/",
    location: "Ithaca, NY",
    period: "Sep 2025 – Present",
    Logo: DTILogo,
    description: "Executing go-to-market and data analysis for student-facing tools serving 15,000+ Cornell users. Benchmarked 8 peer platforms, delivered positioning strategies, and built a feature roadmap adopted by the team.",
  },
  {
    title: "Co-Founder",
    company: "Loadstone Labs",
    url: "https://loadstonelabs.com",
    location: "Ithaca, NY",
    period: "Feb 2026 – Present",
    Logo: LoadstoneLogo,
    description: "Building the data and operating layer for Western water rights, including workflow, basin intelligence, and transaction infrastructure.",
  },
  {
    title: "Growth",
    company: "SH1P",
    url: "https://www.ship-studio.co/",
    location: "Remote",
    period: "Mar 2026 – Present",
    Logo: Ship1Logo,
    description: "Supporting founder growth loops and early product-market fit experiments across accelerator startups.",
  },
];

const ExperienceCard = ({ experience, index }) => {
  const { Logo } = experience;

  return (
    <motion.div
      className="border border-line rounded-lg p-3 bg-paper/80 shadow-card flex gap-3 min-h-0 overflow-hidden"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.15 + index * 0.05, ease: "easeOut" }}
    >
      {/* Logo */}
      <div className="flex-shrink-0 flex items-start pt-0.5" style={{ transform: 'scale(0.82)', transformOrigin: 'top left' }}>
        {Logo && <Logo />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-handwritten text-lg font-bold text-ink leading-tight truncate">{experience.title}</h3>
          <p className="font-body text-[11px] text-fade whitespace-nowrap flex-shrink-0">{experience.period}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-body text-xs text-ink-accent mt-0.5 mb-1">
          <span className="flex items-center gap-1">
            <Briefcase className="w-3 h-3" />
            {experience.url ? (
              <a
                href={experience.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 hover:text-highlight transition-colors"
              >
                {experience.company}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            ) : (
              experience.company
            )}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {experience.location}
          </span>
        </div>
        <p className="font-body text-[13px] text-ink leading-snug line-clamp-3">{experience.description}</p>
      </div>
    </motion.div>
  );
};

const WhatImDoing = () => {
  return (
    <div className="h-full grid grid-cols-1 sm:grid-cols-2 auto-rows-fr gap-3">
      {experiencesData.map((experience, index) => (
        <ExperienceCard key={index} experience={experience} index={index} />
      ))}
    </div>
  );
};

export default WhatImDoing;
