import { useEffect, useState } from 'react';

interface ConfidenceScoreProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

const ConfidenceScore = ({ score, size = 'lg' }: ConfidenceScoreProps) => {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const duration = 1500;
    const steps = 60;
    const increment = score / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= score) {
        setAnimatedScore(score);
        clearInterval(timer);
      } else {
        setAnimatedScore(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [score]);

  const getColor = (s: number) => {
    if (s >= 80) return { stroke: '#22C55E', bg: 'bg-green-100' };
    if (s >= 60) return { stroke: '#EAB308', bg: 'bg-yellow-100' };
    if (s >= 40) return { stroke: '#F97316', bg: 'bg-orange-100' };
    return { stroke: '#EF4444', bg: 'bg-red-100' };
  };

  const getRecommendation = (s: number) => {
    if (s >= 80) return 'GO';
    if (s >= 60) return 'GO WITH CAUTION';
    if (s >= 40) return 'RECONSIDER';
    return "DON'T GO";
  };

  const color = getColor(score);
  const recommendation = getRecommendation(score);

  const sizeMap = {
    sm: { circle: 60, stroke: 6, text: 'text-xl' },
    md: { circle: 80, stroke: 8, text: 'text-2xl' },
    lg: { circle: 120, stroke: 10, text: 'text-4xl' }
  };

  const dimensions = sizeMap[size];
  const radius = (dimensions.circle - dimensions.stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (animatedScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg width={dimensions.circle} height={dimensions.circle}>
          <circle
            cx={dimensions.circle / 2}
            cy={dimensions.circle / 2}
            r={radius}
            stroke="#E5E7EB"
            strokeWidth={dimensions.stroke}
            fill="none"
          />
          <circle
            cx={dimensions.circle / 2}
            cy={dimensions.circle / 2}
            r={radius}
            stroke={color.stroke}
            strokeWidth={dimensions.stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.3s ease',
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%'
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${dimensions.text} font-handwritten font-bold text-ink`}>
            {animatedScore}%
          </span>
        </div>
      </div>

      <div className={`px-4 py-2 ${color.bg} border-2 border-${color.stroke.replace('#', '')} font-handwritten text-lg font-bold text-ink`}
        style={{ borderRadius: '4px 8px 6px 10px' }}>
        {recommendation}
      </div>
    </div>
  );
};

export default ConfidenceScore;
