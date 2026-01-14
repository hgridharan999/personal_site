import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../components/layout/Container';
import { Input } from '../components/ui/Input';
import { TrailCard } from '../components/trail/TrailCard';
import { useTrails } from '../hooks/useTrails';
import { Search } from 'lucide-react';

export const TrailsPage: React.FC = () => {
  const [search, setSearch] = React.useState('');
  const { data, isLoading } = useTrails({ search, limit: 50 });
  const navigate = useNavigate();

  return (
    <Container>
      <div className="mb-8">
        <h1 className="font-handwritten text-5xl font-bold text-ink mb-4">Browse Trails</h1>
        <p className="font-body text-lg text-ink/70 mb-6">
          Explore trails and assess them for your next hike.
        </p>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-fade" />
          <Input
            placeholder="Search trails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="font-body text-ink/70">Loading trails...</p>
        </div>
      ) : data?.trails && data.trails.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.trails.map((trail) => (
            <TrailCard key={trail.id} trail={trail} onClick={() => navigate(`/trails/${trail.id}`)} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="font-body text-ink/70">No trails found.</p>
        </div>
      )}
    </Container>
  );
};
