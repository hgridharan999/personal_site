/** Leak tracker placeholder until sessions are saved (Phases 4 and 6). */
export default function StatsTab() {
  return (
    <div className="pk-empty-state">
      <h2 className="pk-h2">No stats yet</h2>
      <p className="pk-muted">
        Stats arrive after sessions are saved. Your tendencies, biggest leaks and results over time will show up here.
      </p>
    </div>
  );
}
