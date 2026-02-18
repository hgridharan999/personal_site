import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Cloud, Brain, Map, Activity, Target, Database, Zap } from 'lucide-react';
import PageShell from '../components/PageShell';

const FeatureCard = ({ icon: Icon, title, description, delay }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      className="px-3 py-2.5 border border-line rounded-sm hover:border-ink-accent transition-colors duration-300"
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay }}
    >
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-highlight flex-shrink-0" />
        <h3 className="font-handwritten text-lg font-bold text-ink">{title}</h3>
      </div>
    </motion.div>
  );
};

const TrailSensePage = () => {
  const features = [
    {
      icon: Target,
      title: "Personalized Assessment",
      description: "Calculates confidence scores based on your fitness level, technical ability, and gear inventory. Uses Naismith's Rule adapted for your pace."
    },
    {
      icon: Cloud,
      title: "Weather Integration",
      description: "Real-time weather data from NWS API with summit-specific forecasts. Automatic temperature adjustment based on elevation gain."
    },
    {
      icon: Brain,
      title: "ML-Powered Decisions",
      description: "Gradient boosted trees (XGBoost) trained on historical hike outcomes. SHAP explainability shows which factors influence recommendations."
    },
    {
      icon: Activity,
      title: "Adaptive Learning",
      description: "Logs completed hikes and uses Bayesian updating to refine your profile. System gets smarter with every trail you complete."
    },
    {
      icon: Map,
      title: "Trail Database",
      description: "Curated database of 100+ trails with elevation profiles, difficulty ratings, and real-time condition reports from scraped trip reports."
    },
    {
      icon: Zap,
      title: "Smart Recommendations",
      description: "Given your constraints (distance, elevation, drive time), returns top 5 hikes ranked by composite scoring with MMR diversification."
    }
  ];

  const techStack = [
    "React", "TypeScript", "FastAPI", "PostgreSQL", "PostGIS",
    "TanStack Query", "Zustand", "Tailwind CSS", "NWS API", "Groq LLM"
  ];

  return (
    <PageShell title="TrailSense">
      <div className="max-w-3xl mx-auto w-full space-y-6">

        {/* Description + status */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="space-y-2"
        >
          <p className="font-body text-sm text-ink leading-relaxed">
            Hiking decision support system — assesses trail feasibility based on weather, trail characteristics, and your capability profile. Learns from every hike you log.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 border border-green-400/40 font-notes text-xs text-green-700 rounded-sm">
              <Database className="w-3 h-3" /> All 4 phases complete
            </span>
            <span className="font-notes text-xs text-fade">FastAPI · PostgreSQL · React · TypeScript</span>
          </div>
        </motion.div>

        {/* Features grid */}
        <div>
          <h2 className="font-handwritten text-xl font-bold text-ink mb-4">Features</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {features.map((feature, index) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                delay={index * 0.05}
              />
            ))}
          </div>
        </div>

        {/* Tech stack */}
        <div>
          <h2 className="font-handwritten text-xl font-bold text-ink mb-3">Tech Stack</h2>
          <div className="flex flex-wrap gap-1.5">
            {techStack.map((tech) => (
              <span
                key={tech}
                className="px-2.5 py-1 bg-ink-accent/10 border border-ink-accent/20 font-notes text-xs text-ink-accent rounded-sm"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>

      </div>
    </PageShell>
  );
};

export default TrailSensePage;
