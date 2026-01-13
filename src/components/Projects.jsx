import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { HandDrawnArrow, SketchCheckmark, StarDoodle, BracketDecoration } from './HandDrawnElements';
import { ExternalLink, Github, ArrowRight } from 'lucide-react';

const projectsData = [
  {
    date: "January 2026",
    title: "TrailSense",
    description: "A personal hiking decision support system that assesses trail feasibility and recommends hikes based on weather conditions, trail characteristics, and user capability. Features adaptive learning from logged hikes, real-time weather integration via NWS API, and ML-powered confidence scoring using gradient boosted trees with SHAP explainability.",
    tech: ["React", "FastAPI", "PostgreSQL", "XGBoost", "Mapbox", "NWS API"],
    liveUrl: null,
    githubUrl: null,
    internalUrl: "/trailsense",
  },
  {
    date: "August 2025 - Present",
    title: "Fintech Prediction Market Startup",
    description: "Co-founded a stealth fintech startup that achieved top 10% among 20,000+ Y Combinator applicants. Built the entire platform from scratch—user experience, landing page, database systems, and core functionality. Created detailed financial projections, competitive analysis, and monetization models for investor pitches.",
    tech: ["React", "JavaScript", "Database Management", "Financial Modeling"],
    liveUrl: null,
    githubUrl: null,
  },
  {
    date: "December 2025",
    title: "Dynamic Sports Betting Portfolio Optimizer",
    description: "Reinforcement learning agent that optimizes betting strategies across multiple sports markets using PPO and DQN algorithms. Trained on historical odds data from NFL, NBA, and tennis to maximize Kelly Criterion-adjusted returns while managing risk constraints. Outperformed baseline strategies (flat betting, martingale) by 23% in simulated environments with realistic bankroll dynamics.",
    tech: ["Python", "PyTorch", "Stable-Baselines3", "Pandas", "NumPy", "Odds API"],
    liveUrl: null,
    githubUrl: "https://github.com/hgridharan999",
  },
  {
    date: "January 2026",
    title: "VC Deal Flow Analyzer",
    description: "NLP system that analyzes startup pitch decks and predicts funding success for venture capital firms. Fine-tuned LLaMA 3.1 on 800+ pitch decks to extract key metrics (market size, traction, team background) and built binary classifier achieving 78% accuracy on funding prediction. Implemented RAG pipeline to generate comparative feedback against successful historical pitches in similar sectors.",
    tech: ["Python", "LangChain", "LLaMA 3.1", "ChromaDB", "FastAPI", "scikit-learn"],
    liveUrl: null,
    githubUrl: "https://github.com/hgridharan999",
  },
  {
    date: "December 2025 - January 2026",
    title: "Rice Yield Prediction System for Tamil Nadu",
    description: "Satellite-based crop forecasting system that predicts rice harvests 60 days before harvest using multi-temporal remote sensing data. Processed 500GB+ of Sentinel-1/2 imagery via Google Earth Engine, achieving R²=0.85 and 10% error rate across 400,000+ hectares. Deployed full-stack application with FastAPI backend, PostgreSQL/PostGIS for geospatial queries, and interactive Mapbox frontend for agricultural stakeholders.",
    tech: ["Python", "TensorFlow", "XGBoost", "Google Earth Engine", "FastAPI", "PostgreSQL", "PostGIS", "React", "Mapbox"],
    liveUrl: null,
    githubUrl: "https://github.com/hgridharan999",
  }
];

const ProjectCard = ({ project, index }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      className="relative mb-12 group"
      initial={{ opacity: 0, x: -30 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{
        duration: 0.6,
        delay: index * 0.15,
        ease: "easeOut"
      }}
    >
      {/* Hand-drawn border */}
      <div className="relative bg-paper/50 p-6 md:p-8 rounded-sm border-2 border-line hover:shadow-page-hover transition-all duration-300 hover:translate-x-1 hover:-translate-y-1">
        {/* Date in corner */}
        <div className="absolute -top-3 -left-2 bg-paper px-3 py-1 font-notes text-sm text-fade rotate-2 border border-line">
          {project.date}
        </div>

        {/* Checkmark or star decoration */}
        <div className="absolute -right-3 -top-3">
          {index % 2 === 0 ? (
            <div className="bg-paper p-2 rounded-full border-2 border-ink-accent">
              <SketchCheckmark delay={index * 0.15 + 0.5} />
            </div>
          ) : (
            <div className="bg-paper p-2 rounded-full">
              <StarDoodle delay={index * 0.15 + 0.5} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="space-y-4 mt-4">
          {/* Title with hand-drawn underline */}
          <div className="relative inline-block">
            <h3 className="text-2xl md:text-3xl font-handwritten font-bold text-ink pr-8">
              {project.title}
            </h3>
            <svg
              className="absolute -bottom-1 left-0 w-full"
              height="6"
              viewBox="0 0 200 6"
              fill="none"
              preserveAspectRatio="none"
            >
              <motion.path
                d="M2 3Q50 1 100 3T198 4"
                stroke="#6B7A5C"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={isInView ? { pathLength: 1 } : {}}
                transition={{ duration: 0.8, delay: index * 0.15 + 0.3 }}
              />
            </svg>
          </div>

          {/* Description */}
          <p className="font-body text-base md:text-lg text-ink leading-relaxed">
            {project.description}
          </p>

          {/* Tech stack - hand-drawn bubbles */}
          <div className="flex flex-wrap gap-2 pt-2">
            {project.tech.map((tech, i) => (
              <span
                key={i}
                className="tech-bubble"
                style={{
                  animationDelay: `${index * 0.15 + 0.6 + i * 0.1}s`
                }}
              >
                {tech}
              </span>
            ))}
          </div>

          {/* Links with hand-drawn style */}
          <div className="flex flex-wrap gap-4 pt-4">
            {project.internalUrl && (
              <Link
                to={project.internalUrl}
                className="handwritten-link flex items-center gap-1.5 group/link"
              >
                <HandDrawnArrow direction="right" className="w-4 h-4 text-highlight group-hover/link:translate-x-1 transition-transform" />
                <span>explore project</span>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover/link:opacity-100 transition-opacity" />
              </Link>
            )}
            {project.liveUrl && (
              <a
                href={project.liveUrl}
                className="handwritten-link flex items-center gap-1.5 group/link"
                target="_blank"
                rel="noopener noreferrer"
              >
                <HandDrawnArrow direction="right" className="w-4 h-4 text-highlight group-hover/link:translate-x-1 transition-transform" />
                <span>see it here</span>
                <ExternalLink className="w-4 h-4 opacity-0 group-hover/link:opacity-100 transition-opacity" />
              </a>
            )}
            {project.githubUrl && (
              <a
                href={project.githubUrl}
                className="handwritten-link flex items-center gap-1.5 group/link"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="w-4 h-4" />
                <span>github notes</span>
                <HandDrawnArrow direction="right" className="w-4 h-4 text-highlight group-hover/link:translate-x-1 transition-transform" />
              </a>
            )}
          </div>
        </div>

        {/* Small margin doodles */}
        <div className="absolute -left-6 top-1/2 hidden lg:block opacity-30">
          <BracketDecoration side="left" />
        </div>
      </div>
    </motion.div>
  );
};

const Projects = () => {
  const titleRef = useRef(null);
  const titleInView = useInView(titleRef, { once: true });

  return (
    <section className="relative py-16 md:py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Section title with hand-drawn arrow */}
        <motion.div
          ref={titleRef}
          className="mb-16 relative"
          initial={{ opacity: 0, y: 20 }}
          animate={titleInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center gap-4">
            <h2 className="text-4xl md:text-5xl font-handwritten font-bold text-ink">
              Projects & Builds
            </h2>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={titleInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <HandDrawnArrow direction="down" className="w-8 h-8 text-highlight rotate-90" />
            </motion.div>
          </div>

          {/* Hand-drawn underline under title */}
          <svg
            className="mt-2"
            width="280"
            height="8"
            viewBox="0 0 280 8"
            fill="none"
          >
            <motion.path
              d="M4 4Q70 2 140 4T276 5"
              stroke="#C67B5C"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={titleInView ? { pathLength: 1 } : {}}
              transition={{ duration: 1.2, delay: 0.5 }}
            />
          </svg>
        </motion.div>

        {/* Project cards */}
        <div className="space-y-8">
          {projectsData.map((project, index) => (
            <ProjectCard key={index} project={project} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Projects;
