import { User, Cloud, Mountain, Backpack, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface BreakdownCardProps {
  category: 'capability' | 'weather' | 'conditions' | 'gear';
  status: 'good' | 'warning' | 'bad';
  notes: string;
}

const BreakdownCard = ({ category, status, notes }: BreakdownCardProps) => {
  const iconMap = {
    capability: User,
    weather: Cloud,
    conditions: Mountain,
    gear: Backpack
  };

  const statusConfig = {
    good: {
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    warning: {
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200'
    },
    bad: {
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200'
    }
  };

  const CategoryIcon = iconMap[category];
  const StatusIcon = statusConfig[status].icon;
  const categoryLabels = {
    capability: 'Your Capability',
    weather: 'Weather',
    conditions: 'Trail Conditions',
    gear: 'Gear'
  };

  return (
    <div
      className={`${statusConfig[status].bgColor} ${statusConfig[status].borderColor} border-2 p-4 transition-all duration-300 hover:shadow-lg hover:translate-x-1 hover:-translate-y-1`}
      style={{ borderRadius: '4px 8px 6px 10px' }}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-paper rounded-full border-2 border-line">
          <CategoryIcon className="w-5 h-5 text-ink-accent" />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-handwritten text-lg font-bold text-ink">
              {categoryLabels[category]}
            </h4>
            <StatusIcon className={`w-5 h-5 ${statusConfig[status].color}`} />
          </div>

          <p className="font-body text-sm text-ink/80 leading-relaxed">
            {notes}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BreakdownCard;
