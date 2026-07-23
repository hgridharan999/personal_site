import { Cloud, Brain, Map, Activity, Target, Zap } from 'lucide-react';
import SubShell from './SubShell';

const FEATURES = [
  { icon: Target, title: 'Personalized Assessment', desc: "Calculates confidence scores based on your fitness level, technical ability, and gear inventory. Uses Naismith's Rule adapted for your pace." },
  { icon: Cloud, title: 'Weather Integration', desc: 'Real-time weather data from NWS API with summit-specific forecasts. Automatic temperature adjustment based on elevation gain.' },
  { icon: Brain, title: 'ML-Powered Decisions', desc: 'Gradient boosted trees (XGBoost) trained on historical hike outcomes. SHAP explainability shows which factors influence recommendations.' },
  { icon: Activity, title: 'Adaptive Learning', desc: 'Logs completed hikes and uses Bayesian updating to refine your profile. System gets smarter with every trail you complete.' },
  { icon: Map, title: 'Trail Database', desc: 'Curated database of 100+ trails with elevation profiles, difficulty ratings, and real-time condition reports from scraped trip reports.' },
  { icon: Zap, title: 'Smart Recommendations', desc: 'Given your constraints (distance, elevation, drive time), returns top 5 hikes ranked by composite scoring with MMR diversification.' },
];

const TECH = ['React', 'TypeScript', 'FastAPI', 'PostgreSQL', 'PostGIS', 'TanStack Query', 'Zustand', 'Tailwind CSS', 'NWS API', 'Groq LLM'];

export default function AscentTrailSense() {
  return (
    <SubShell title="TrailSense" instrument="trailsense">
      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', gap: 'clamp(18px, 3vh, 30px)', borderTop: '1px solid var(--line)', paddingTop: 'clamp(14px, 2.4vh, 26px)' }}>

        <p style={{ color: 'var(--bone)', fontSize: 'clamp(14px, 1.3vw, 17px)', lineHeight: 1.5, margin: 0, maxWidth: '68ch' }}>
          Hiking decision-support — assesses trail feasibility from weather, trail data, and your capability profile. Learns from every hike you log.
        </p>

        <div className="asc-mono" style={{ color: 'var(--faint)' }}>All 4 phases complete · FastAPI · PostgreSQL · React · TypeScript</div>

        <section>
          <span className="asc-mono asc-amber">Features</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1px', background: 'var(--line)', border: '1px solid var(--line)', marginTop: 14 }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={{ background: 'var(--bg)', padding: 'clamp(16px, 1.6vw, 22px)' }}>
                <f.icon size={18} style={{ color: 'var(--amber)' }} />
                <h3 style={{ fontFamily: 'var(--display)', fontWeight: 700, letterSpacing: '-0.01em', fontSize: 'clamp(16px, 1.4vw, 20px)', margin: '10px 0 6px' }}>{f.title}</h3>
                <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <span className="asc-mono asc-amber">Tech stack</span>
          <div className="asc-tags" style={{ marginTop: 12 }}>
            {TECH.map((t) => <span key={t} className="asc-tag">{t}</span>)}
          </div>
        </section>
      </div>
    </SubShell>
  );
}
