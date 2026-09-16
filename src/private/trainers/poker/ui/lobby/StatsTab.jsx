/** Leak tracker placeholder: sessions are saved (Phase 4); stats arrive with Phase 6. */
export default function StatsTab() {
  return (
    <div className="pk-empty-state">
      <h2 className="pk-h2">No stats yet</h2>
      <p className="pk-muted">
        Your sessions are saved. Your tendencies, biggest leaks and results over time will show up here once stats are built.
      </p>
    </div>
  );
}
