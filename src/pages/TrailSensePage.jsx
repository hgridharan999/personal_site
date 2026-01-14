import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mountain, Cloud, Brain, Map, Activity, Target, Database, Layers, Zap } from 'lucide-react';
import Footer from '../components/Footer';

const FeatureCard = ({ icon: Icon, title, description, delay }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      className="bg-paper/50 p-6 border-2 border-line hover:border-ink-accent transition-all duration-300 hover:shadow-page-hover"
      style={{ borderRadius: '4px 8px 6px 10px' }}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
    >
      <div className="flex items-start gap-4">
        <div className="p-3 bg-highlight/10 border border-highlight/30 rounded-full">
          <Icon className="w-6 h-6 text-highlight" />
        </div>
        <div>
          <h3 className="font-handwritten text-xl font-bold text-ink mb-2">{title}</h3>
          <p className="font-body text-base text-ink/80 leading-relaxed">{description}</p>
        </div>
      </div>
    </motion.div>
  );
};

const TechBadge = ({ children, delay }) => (
  <motion.span
    className="px-3 py-1.5 bg-ink-accent/10 border border-ink-accent/30 font-notes text-sm text-ink-accent inline-block"
    style={{ borderRadius: '10px 12px 8px 14px' }}
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.3, delay }}
  >
    {children}
  </motion.span>
);

const TrailSensePage = () => {
  const heroRef = useRef(null);
  const heroInView = useInView(heroRef, { once: true });
  
  const featuresRef = useRef(null);
  const featuresInView = useInView(featuresRef, { once: true, margin: "-100px" });

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
    <div className="min-h-screen bg-paper relative">
      {/* Subtle vignette */}
      <div className="fixed inset-0 pointer-events-none bg-gradient-radial from-transparent via-transparent to-ink/5" />

      {/* Back navigation */}
      <motion.div
        className="fixed top-6 left-6 z-50"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Link
          to="/"
          className="flex items-center gap-2 px-4 py-2 bg-paper/95 border-2 border-line hover:border-ink-accent transition-all duration-300 font-handwritten text-lg text-ink hover:text-highlight group"
          style={{ borderRadius: '8px 4px 6px 10px' }}
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          back home
        </Link>
      </motion.div>

      {/* Hero Section */}
      <section ref={heroRef} className="pt-24 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            className="inline-flex items-center justify-center gap-3 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <Mountain className="w-12 h-12 text-highlight" />
          </motion.div>

          <motion.h1
            className="text-5xl md:text-7xl font-handwritten font-bold text-ink mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            TrailSense
          </motion.h1>

          <motion.div
            className="w-32 h-1 bg-highlight mx-auto mb-8"
            style={{ borderRadius: '50%' }}
            initial={{ scaleX: 0 }}
            animate={heroInView ? { scaleX: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.3 }}
          />

          <motion.p
            className="text-xl md:text-2xl font-body text-ink/80 leading-relaxed max-w-3xl mx-auto mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            A personal hiking decision support system that assesses trail feasibility 
            and recommends hikes based on weather conditions, trail characteristics, 
            and your unique capability profile.
          </motion.p>

          <motion.div
            className="inline-block px-6 py-3 bg-green-100 border-2 border-green-500/50 font-notes text-base text-green-700"
            style={{ borderRadius: '12px 8px 10px 6px' }}
            initial={{ opacity: 0, y: 20 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Phase 4 Complete — Full-stack MVP ready for deployment
          </motion.div>
        </div>
      </section>

      {/* Problem Statement */}
      <section className="py-16 px-6 bg-line/20">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="bg-paper p-8 border-2 border-line shadow-page"
            style={{ borderRadius: '4px 8px 6px 10px', transform: 'rotate(-0.5deg)' }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-handwritten text-3xl font-bold text-ink mb-4">The Problem</h2>
            <p className="font-body text-lg text-ink/80 leading-relaxed">
              Planning a hike involves juggling multiple variables: weather forecasts at different 
              elevations, trail conditions, your current fitness level, required gear, drive time, 
              and risk tolerance. Most hikers either wing it (risky) or spend hours researching 
              every option (tedious). TrailSense automates this decision-making process while 
              learning your preferences over time.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section ref={featuresRef} className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            className="font-handwritten text-4xl font-bold text-ink mb-12 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            Core Features
          </motion.h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                delay={index * 0.1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-16 px-6 bg-line/20">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h2
            className="font-handwritten text-3xl font-bold text-ink mb-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            Tech Stack
          </motion.h2>

          <motion.div
            className="flex flex-wrap justify-center gap-3"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {techStack.map((tech, index) => (
              <TechBadge key={tech} delay={index * 0.05}>
                {tech}
              </TechBadge>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Architecture Overview */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            className="font-handwritten text-3xl font-bold text-ink mb-8 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            How It Works
          </motion.h2>

          <div className="space-y-6">
            {[
              {
                step: "1",
                title: "Profile Setup",
                description: "User completes onboarding: fitness metrics, technical ability, gear inventory, and location. This creates a personalized capability baseline."
              },
              {
                step: "2",
                title: "Trail Assessment",
                description: "Select a trail and date. System fetches weather forecasts, recent trip reports, and calculates a confidence score using hard rules + ML model."
              },
              {
                step: "3",
                title: "Smart Recommendations",
                description: "Or let TrailSense recommend hikes based on your constraints. Returns top 5 options ranked by composite score with MMR diversification."
              },
              {
                step: "4",
                title: "Log & Learn",
                description: "After hiking, log your experience. System uses Bayesian updating to refine your profile and improve future predictions."
              }
            ].map((item, index) => (
              <motion.div
                key={item.step}
                className="flex gap-6 items-start"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className="flex-shrink-0 w-12 h-12 bg-highlight text-paper font-handwritten text-2xl font-bold flex items-center justify-center rounded-full">
                  {item.step}
                </div>
                <div>
                  <h3 className="font-handwritten text-xl font-bold text-ink mb-1">{item.title}</h3>
                  <p className="font-body text-base text-ink/80 leading-relaxed">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Status */}
      <section className="py-16 px-6 bg-line/20">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            className="bg-paper p-8 border-2 border-green-500/50 shadow-page inline-block"
            style={{ borderRadius: '8px 4px 6px 10px' }}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Database className="w-10 h-10 text-green-600 mx-auto mb-4" />
            <h2 className="font-handwritten text-2xl font-bold text-ink mb-3">Development Complete</h2>
            <p className="font-body text-base text-ink/80 mb-4">
              All 4 phases complete! TrailSense features a full-stack implementation with intelligent assessments, personalized recommendations, and hike logging.
              <br />
              Backend: FastAPI + PostgreSQL with decision engine and LLM parsing
              <br />
              Frontend: React + TypeScript with hand-drawn design system
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-sm font-notes text-fade">
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full">✓ PRD Complete</span>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full">✓ Phase 1: Backend Core</span>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full">✓ Phase 2: Intelligence</span>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full">✓ Phase 3: Frontend Core</span>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full">✓ Phase 4: Polish & Features</span>
            </div>
            <div className="mt-6 pt-6 border-t-2 border-line">
              <p className="font-notes text-sm text-ink-accent mb-3">Key Features Implemented:</p>
              <div className="grid grid-cols-2 gap-2 text-sm font-body text-ink/70">
                <div>• Trail assessment with confidence scores</div>
                <div>• Personalized recommendations</div>
                <div>• Weather integration</div>
                <div>• Hike logging & statistics</div>
                <div>• User onboarding</div>
                <div>• LLM trip report parsing</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default TrailSensePage;
