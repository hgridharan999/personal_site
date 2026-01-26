import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { Calendar, MapPin, Briefcase } from 'lucide-react';

const experiencesData = [
  {
    title: "AI/Strategy Consultant (Contract)",
    company: "Adobe",
    location: "Remote",
    period: "Jan 2025 - Present",
    description: "Conducting competitive analysis of AI tools across model training, performance metrics, and market adoption. Researching data privacy, model performance, governance, and IP protection frameworks for enterprise AI deployment. Developing strategic brief on model-optimized architecture and services for board presentation, supporting IT leadership.",
    type: "work"
  },
  {
    title: "Developer",
    company: "Cornell Entrepreneurship Club",
    location: "Ithaca, NY",
    period: "Sep 2025 - Present",
    description: "Engineered high-risk experimental projects: ML applications and analysis, full-stack web platforms, geospatial analysis. Organized YC speaker series, managed logistics (150+ attendees), partnered with unicorns and venture-backed startups. Generated 140,000+ views on Instagram/LinkedIn through speaker content and technical project showcases.",
    type: "work"
  },
  {
    title: "Business Analyst",
    company: "Cornell Digital Tech and Innovation (DTI)",
    location: "Ithaca, NY",
    period: "Nov 2025 - Present",
    description: "Developed content strategy and marketing materials for product initiatives serving 15,000+ Cornell students. Conducted market analysis and developed strategic recommendations for digital product enhancements. Organized teamwide social events and fundraisers for 70+ members, led fundraising ventures.",
    type: "work"
  },
];

const ExperienceCard = ({ experience, index }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      className="relative mb-10 group"
      initial={{ opacity: 0, x: 30 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{
        duration: 0.6,
        delay: index * 0.12,
        ease: "easeOut"
      }}
    >
      {/* Timeline dot */}
      <div className="absolute -left-8 top-4 w-4 h-4 rounded-full bg-ink-accent border-2 border-paper shadow-sm" />

      <div className="relative bg-paper/50 p-5 md:p-6 rounded-sm border-2 border-line hover:shadow-page transition-all duration-300 hover:translate-x-1 hover:-translate-y-0.5"
        style={{
          borderRadius: '18px 20px 16px 22px',
          transform: `rotate(${index % 2 === 0 ? '0.3deg' : '-0.3deg'})`
        }}
      >
        {/* Period stamp */}
        <div className="absolute -top-3 -right-2 bg-paper px-3 py-1 font-notes text-xs text-fade border border-line shadow-tape"
          style={{ transform: 'rotate(2deg)' }}
        >
          {experience.period}
        </div>

        {/* Content */}
        <div className="space-y-3">
          {/* Title */}
          <h3 className="text-xl md:text-2xl font-handwritten font-bold text-ink">
            {experience.title}
          </h3>

          {/* Company and location */}
          <div className="flex flex-wrap gap-4 text-sm font-body text-ink-accent">
            <div className="flex items-center gap-1.5">
              <Briefcase className="w-4 h-4" />
              <span>{experience.company}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              <span>{experience.location}</span>
            </div>
          </div>

          {/* Description */}
          <p className="font-body text-sm md:text-base text-ink leading-relaxed pt-1">
            {experience.description}
          </p>
        </div>

        {/* Hand-drawn underline under title */}
        <svg
          className="absolute top-[52px] left-5 w-[60%]"
          height="4"
          viewBox="0 0 200 4"
          fill="none"
          preserveAspectRatio="none"
        >
          <motion.path
            d="M2 2Q50 1 100 2T198 2"
            stroke="#6B7A5C"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={isInView ? { pathLength: 1 } : {}}
            transition={{ duration: 0.8, delay: index * 0.12 + 0.3 }}
          />
        </svg>
      </div>
    </motion.div>
  );
};

const WhatImDoing = () => {
  const titleRef = useRef(null);
  const descRef = useRef(null);
  const titleInView = useInView(titleRef, { once: true });
  const descInView = useInView(descRef, { once: true });

  return (
    <section id="doing" className="relative py-16 md:py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section title */}
        <motion.div
          ref={titleRef}
          className="mb-12 relative"
          initial={{ opacity: 0, y: 20 }}
          animate={titleInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl md:text-5xl font-handwritten font-bold text-ink mb-4">
            What I'm Doing
          </h2>

          {/* Hand-drawn underline */}
          <svg
            className="mb-6"
            width="320"
            height="8"
            viewBox="0 0 320 8"
            fill="none"
          >
            <motion.path
              d="M4 4Q80 2 160 4T316 5"
              stroke="#C67B5C"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={titleInView ? { pathLength: 1 } : {}}
              transition={{ duration: 1.2, delay: 0.4 }}
            />
          </svg>

          {/* Short intro description */}
          <motion.p
            ref={descRef}
            className="font-body text-base md:text-lg text-ink leading-relaxed max-w-2xl"
            initial={{ opacity: 0, y: 10 }}
            animate={descInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Building startups, leading projects, and organizing events. From YC applications to nonprofit work, here's where I'm making an impact and what I'm learning along the way.
          </motion.p>
        </motion.div>

        {/* Timeline line */}
        <div className="relative pl-8 border-l-2 border-dashed border-line">
          {/* Experience cards */}
          <div className="space-y-6">
            {experiencesData.map((experience, index) => (
              <ExperienceCard key={index} experience={experience} index={index} />
            ))}
          </div>
        </div>

        {/* Small decorative element at bottom */}
        <motion.div
          className="mt-12 flex justify-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          <svg width="60" height="40" viewBox="0 0 60 40" fill="none">
            <motion.path
              d="M10 20h40M30 10v20M20 15l10-5 10 5M20 25l10 5 10-5"
              stroke="#D4CFC4"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.4"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, delay: 0.6 }}
            />
          </svg>
        </motion.div>
      </div>
    </section>
  );
};

export default WhatImDoing;
