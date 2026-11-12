import { httpUrl } from '../../site/notes';

// The brief: three stories and the niche item, each in original wording with its source link.

/** A link only for an http(s) URL; anything else (javascript:, data:, junk) is shown as text. */
function SourceLink({ url, source }) {
  const safeUrl = httpUrl(url);
  const label = source || 'Source';
  if (!safeUrl) return <p className="nt-source asc-mono">{label}</p>;
  return (
    <a className="nt-source asc-mono" href={safeUrl} target="_blank" rel="noopener noreferrer">
      {label} <span aria-hidden="true">↗</span>
      <span className="nt-sr"> (opens in a new tab)</span>
    </a>
  );
}

function Item({ n, label, item }) {
  return (
    <li className="nt-story">
      <p className="asc-mono nt-story__idx">{label ?? `Story ${n}`}</p>
      <h3 className="nt-story__headline">{item.headline}</h3>
      <p className="nt-prose">{item.summary}</p>
      <SourceLink url={item.url} source={item.source} />
    </li>
  );
}

export default function NightlyBrief({ stories = [], niche }) {
  return (
    <section className="nt-section" aria-labelledby="nt-brief-title">
      <h2 id="nt-brief-title" className="nt-section__title">The brief</h2>
      <ol className="nt-stories" role="list">
        {stories.map((story, i) => <Item key={story.url ?? i} n={i + 1} item={story} />)}
        {niche && <Item label={`Off the path · ${niche.topic}`} item={niche} />}
      </ol>
    </section>
  );
}
