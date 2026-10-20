const pad = (n) => String(n + 1).padStart(2, '0');

function HikeRow({ hike, index, active, onSelect }) {
  return (
    <li>
      <button type="button" className="sp-hike-row" aria-pressed={active} onClick={() => onSelect(index)}>
        <span className="sp-hike-n">{pad(index)}</span>
        <span className="sp-hike-name">{hike.name}</span>
        <span className="sp-hike-date">{hike.date}</span>
      </button>
    </li>
  );
}

/**
 * One native <details> per state. The browser owns keyboard and find-in-page; `onToggle` only
 * reports the result so the map knows which pins to show. Nothing interactive sits inside the
 * <summary>: the whole bar is the control, and the hikes are buttons in the panel below it.
 */
export default function StateList({ groups, sel, open, onToggle, onSelect }) {
  return (
    <section aria-labelledby="sp-hikes-label">
      <h2 className="sr-only" id="sp-hikes-label">Hikes by state</h2>
      {groups.map((group) => {
        const count = group.hikes.length;
        return (
          <details
            key={group.state}
            className="sp-disclosure sp-state"
            open={Boolean(open[group.state])}
            onToggle={(event) => onToggle(group.state, event.currentTarget.open)}
          >
            <summary>
              <span className="sp-state-name">{group.state}</span>
              <span className="sp-state-count">{count} {count === 1 ? 'hike' : 'hikes'}</span>
              <span className="xp-mark" aria-hidden="true" />
            </summary>
            <ul role="list" className="sp-hikes">
              {group.hikes.map((hike, k) => (
                <HikeRow
                  key={group.start + k}
                  hike={hike}
                  index={group.start + k}
                  active={group.start + k === sel}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </details>
        );
      })}
    </section>
  );
}
