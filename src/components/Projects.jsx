import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ExternalLink, Github, ArrowRight, Lock, Star } from 'lucide-react';

const BigRedNetworkLogo = () => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ width: 44, height: 44 }}>
    <rect width="100" height="100" fill="#B31B1B" rx="8" />
    <text x="50" y="58" fontFamily="monospace" fontSize="32" fontWeight="bold" fill="white" textAnchor="middle">BR</text>
  </svg>
);

const LoadstoneLogo = () => (
  <img src="https://loadstonelabs.com/_next/image?url=%2Floadstone-logo.png&w=48&q=75" alt="Loadstone" style={{ width: 44, height: 44 }} className="object-contain" />
);

const projectsData = [
  {
    date: "February 2026 - Present",
    title: "Loadstone",
    description: "Data and operating layer infrastructure for Western water rights. Loadstone unifies workflow, basin intelligence, and transaction infrastructure for attorneys and engineers.",
    tech: ["Python", "Monte Carlo Simulation", "React", "Drones", "Infrastructure Modeling"],
    liveUrl: "https://loadstonelabs.com/",
    githubUrl: null,
    Logo: LoadstoneLogo,
    featured: true,
  },
  {
    date: "January 2026 - Present",
    title: "BigRed Network",
    description: "Curated directory platform connecting Cornell builders, founders, and researchers. Built member filtering, network visualization, and manual review workflows for controlled access.",
    tech: ["React", "TypeScript", "Network Graphs", "Authentication"],
    liveUrl: "https://www.bigred.network/",
    githubUrl: null,
    Logo: BigRedNetworkLogo,
    featured: true,
  },
  {
    date: "September 2025 - Present",
    title: "Social Network Prediction Market Platform",
    description: "Co-founded a fintech prediction market platform that ranked in the top 10% of 20,000+ YC applicants. Built the product from concept to MVP, including prediction logic and unit-economics modeling.",
    tech: ["React", "Node.js", "PostgreSQL", "Python"],
    liveUrl: null,
    githubUrl: null,
    stealth: true,
  },
  {
    date: "December 2025 – January 2026",
    title: "Open-Source LLM Cost Optimizer",
    description: "Open-source Python toolkit for lowering LLM API spend via model routing, prompt tuning, and semantic caching with sentence-transformers plus Redis. Benchmarked GPT-4, Claude, and Gemini on cost-efficiency tradeoffs.",
    tech: ["Python", "Redis", "OpenAI API", "Anthropic API", "Sentence-Transformers", "AsyncIO", "Pytest"],
    liveUrl: null,
    githubUrl: "https://github.com/hgridharan999/token_optimizer",
  },
  {
    date: "January 2026 - Present",
    title: "AI-Powered Climate Solution Discovery Engine",
    description: "NLP discovery engine analyzing 10,000+ climate-tech startups across 50+ verticals. Uses BERT embeddings, multi-factor scoring, and semantic search for sub-second retrieval.",
    tech: ["Python", "BERT", "FAISS", "Sentence-Transformers", "Pandas", "scikit-learn"],
    liveUrl: null,
    githubUrl: "https://github.com/hgridharan999",
    internalUrl: "/climate-search",
  },
  {
    date: "December 2025 – January 2026",
    title: "AI-Powered Startup Discovery Engine",
    description: "Research tool for semantic retrieval of companies across 50+ technical verticals for strategic sourcing. Uses multi-factor scoring (founder backgrounds, patent data, market signals) to surface and rank investment candidates. Deployed as an internal valuation and search tool.",
    tech: ["Python", "NLP/Embeddings", "BERT", "FAISS", "pandas", "scikit-learn"],
    liveUrl: null,
    githubUrl: "https://github.com/hgridharan999",
    internalUrl: null,
  },
  {
    date: "January 2026",
    title: "TrailSense",
    description: "Hiking decision-support system with ML confidence scoring (XGBoost + SHAP), real-time NWS weather ingestion, and adaptive learning from logged hikes.",
    tech: ["React", "FastAPI", "PostgreSQL", "XGBoost", "Mapbox", "NWS API"],
    liveUrl: null,
    githubUrl: null,
    internalUrl: "/trailsense",
  }
];

const ProjectCard = ({ project, index }) => {
  return (
    <motion.div
      className="border border-line rounded-lg p-3 shadow-card bg-paper-subtle flex flex-col min-h-0 overflow-hidden"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.15 + index * 0.05, ease: "easeOut" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="font-handwritten text-lg font-bold text-ink leading-tight truncate">{project.title}</h3>
          {project.featured && (
            <Star className="w-3 h-3 fill-current text-highlight shrink-0" />
          )}
        </div>
        <p className="font-body text-[11px] text-fade whitespace-nowrap flex-shrink-0">{project.date}</p>
      </div>

      <p className="font-body text-[13px] text-ink leading-snug line-clamp-2 mt-1">{project.description}</p>

      <p className="font-body text-[11px] text-fade line-clamp-1 mt-1">{project.tech.join(' · ')}</p>

      <div className="flex flex-wrap gap-x-3 gap-y-1 items-center mt-auto pt-1.5">
        {project.stealth && (
          <span className="inline-flex items-center gap-1 font-body text-xs text-fade">
            <Lock className="w-3 h-3" />
            in stealth
          </span>
        )}
        {project.internalUrl && (
          <Link
            to={project.internalUrl}
            className="inline-flex items-center gap-1 font-body text-xs text-ink-accent hover:text-highlight transition-colors group"
          >
            explore
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}
        {project.liveUrl && (
          <a
            href={project.liveUrl}
            className="inline-flex items-center gap-1 font-body text-xs text-ink-accent hover:text-highlight transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            live site
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {project.githubUrl && (
          <a
            href={project.githubUrl}
            className="inline-flex items-center gap-1 font-body text-xs text-ink-accent hover:text-highlight transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="w-3 h-3" />
            github
          </a>
        )}
      </div>
    </motion.div>
  );
};

const Projects = () => {
  return (
    <div className="h-full grid grid-cols-1 sm:grid-cols-2 auto-rows-fr gap-3">
      {projectsData.map((project, index) => (
        <ProjectCard key={index} project={project} index={index} />
      ))}
    </div>
  );
};

export default Projects;
