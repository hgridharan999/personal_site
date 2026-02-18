import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Github, ArrowRight, Lock } from 'lucide-react';

const projectsData = [
  {
    date: "September 2025 - Present",
    title: "Social Network Prediction Market Platform",
    description: "Co-founded a fintech prediction market platform, ranking top 10% among 20,000+ YC applicants. Built full-stack from concept to MVP including prediction algorithms and a unit economics model.",
    tech: ["React", "Node.js", "PostgreSQL", "Python"],
    liveUrl: null,
    githubUrl: null,
    stealth: true,
  },
  {
    date: "December 2025 – January 2026",
    title: "Open-Source LLM Cost Optimizer",
    description: "Python toolkit to cut LLM API costs via intelligent model selection, prompt tuning, and a semantic cache layer using sentence-transformers + Redis. Benchmarked GPT-4, Claude, and Gemini for cost efficiency.",
    tech: ["Python", "Redis", "OpenAI API", "Anthropic API", "Sentence-Transformers", "AsyncIO", "Pytest"],
    liveUrl: null,
    githubUrl: "https://github.com/hgridharan999/token_optimizer",
  },
  {
    date: "January 2026 - Present",
    title: "AI-Powered Climate Solution Discovery Engine",
    description: "NLP platform analyzing 10,000+ climate tech startups across 50+ verticals using BERT embeddings, multi-factor scoring, and semantic search for sub-second company retrieval.",
    tech: ["Python", "BERT", "FAISS", "Sentence-Transformers", "Pandas", "scikit-learn"],
    liveUrl: null,
    githubUrl: "https://github.com/hgridharan999",
    internalUrl: "/climate-search",
  },
  {
    date: "January 2026",
    title: "TrailSense",
    description: "Hiking decision support system with ML-powered confidence scoring (XGBoost + SHAP), real-time NWS weather integration, and adaptive learning from logged hikes.",
    tech: ["React", "FastAPI", "PostgreSQL", "XGBoost", "Mapbox", "NWS API"],
    liveUrl: null,
    githubUrl: null,
    internalUrl: "/trailsense",
  }
];

const ProjectCard = ({ project, index }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      className="border-b border-line pb-3 last:border-0"
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.08, ease: "easeOut" }}
    >
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <h3 className="font-handwritten text-xl font-bold text-ink">{project.title}</h3>
        <p className="font-notes text-sm text-fade whitespace-nowrap flex-shrink-0">{project.date}</p>
      </div>

      <p className="font-body text-sm text-ink leading-relaxed mb-2">{project.description}</p>

      <p className="font-notes text-xs text-fade mb-2">{project.tech.join(' · ')}</p>

      <div className="flex flex-wrap gap-5 items-center">
        {project.stealth && (
          <span className="inline-flex items-center gap-1.5 font-body text-sm text-fade">
            <Lock className="w-3.5 h-3.5" />
            building in stealth
          </span>
        )}
        {project.internalUrl && (
          <Link
            to={project.internalUrl}
            className="inline-flex items-center gap-1 font-body text-sm text-ink-accent hover:text-highlight transition-colors group"
          >
            explore project
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}
        {project.liveUrl && (
          <a
            href={project.liveUrl}
            className="inline-flex items-center gap-1 font-body text-sm text-ink-accent hover:text-highlight transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            live site
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {project.githubUrl && (
          <a
            href={project.githubUrl}
            className="inline-flex items-center gap-1 font-body text-sm text-ink-accent hover:text-highlight transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="w-3.5 h-3.5" />
            github
          </a>
        )}
      </div>
    </motion.div>
  );
};

const Projects = () => {
  return (
    <section className="py-2 px-6 max-w-3xl">
      <div className="space-y-3">
        {projectsData.map((project, index) => (
          <ProjectCard key={index} project={project} index={index} />
        ))}
      </div>
    </section>
  );
};

export default Projects;
