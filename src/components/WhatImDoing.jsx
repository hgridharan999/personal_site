import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { MapPin, Briefcase } from 'lucide-react';

const experiencesData = [
  {
    title: "AI/Strategy Consultant (Contract)",
    company: "Adobe",
    location: "Remote",
    period: "Jan 2025 - Present",
    description: "Competitive analysis of AI tools across model training, performance, and market adoption. Developing strategic briefs on model-optimized architecture for board presentation and IT leadership.",
  },
  {
    title: "Developer",
    company: "Cornell Entrepreneurship Club",
    location: "Ithaca, NY",
    period: "Sep 2025 - Present",
    description: "Built ML apps, full-stack platforms, and geospatial tools. Organized YC speaker series (150+ attendees), partnered with unicorns and venture-backed startups, generated 140k+ views on social media.",
  },
  {
    title: "Business Analyst",
    company: "Cornell Digital Tech and Innovation (DTI)",
    location: "Ithaca, NY",
    period: "Nov 2025 - Present",
    description: "Content strategy and market analysis for products serving 15,000+ Cornell students. Organized team events and fundraisers for 70+ members.",
  },
];

const ExperienceCard = ({ experience, index }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      className="border-b border-line pb-4 last:border-0"
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.08, ease: "easeOut" }}
    >
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <h3 className="font-handwritten text-xl font-bold text-ink">{experience.title}</h3>
        <p className="font-notes text-sm text-fade whitespace-nowrap flex-shrink-0">{experience.period}</p>
      </div>

      <div className="flex flex-wrap gap-4 font-body text-sm text-ink-accent mb-2">
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
    </motion.div>
  );
};

const WhatImDoing = () => {
  return (
    <section id="doing" className="py-2 px-6 max-w-3xl">
      <div className="space-y-3">
        {experiencesData.map((experience, index) => (
          <ExperienceCard key={index} experience={experience} index={index} />
        ))}
      </div>
    </section>
  );
};

export default WhatImDoing;
