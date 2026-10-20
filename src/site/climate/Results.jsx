import { A11Y, NBSP } from '../../home/content';
import { formatScore, metaParts } from './search';

// A startup with no website gets a web search for its name, as the old card did.
const searchUrl = (name) => `https://www.google.com/search?q=${encodeURIComponent(`${name} climate startup`)}`;

function Result({ startup, score, onVisit }) {
  const match = formatScore(score);
  const hasSite = Boolean(startup.website_url);
  return (
    <li className="row row--plain sp-result">
      <span className="ttl">
        <a
          className="org"
          href={startup.website_url || searchUrl(startup.name)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onVisit}
        >
          {startup.name}
          <span aria-hidden="true">{NBSP}↗</span>
          <span className="sr-only">{hasSite ? A11Y.newTab : ' (web search, opens in new tab)'}</span>
        </a>
      </span>
      {match && <span className="when">{match}<span className="sr-only"> match</span></span>}
      {startup.short_description && <p className="line">{startup.short_description}</p>}
      <p className="sp-result-meta">{metaParts(startup).join(' · ')}</p>
    </li>
  );
}

/** The ledger of matches. The page's status region announces the count, so this line stays quiet. */
export default function Results({ results, searchInfo, onVisit }) {
  const total = searchInfo?.totalResults ?? results.length;
  const time = searchInfo?.processingTime;
  return (
    <div>
      <div className="sp-results-head">
        <h2 className="head" id="sp-results-title">Results</h2>
        <p className="sp-status">
          {total} {total === 1 ? 'startup' : 'startups'}
          {Number.isFinite(time) && ` · ${Math.round(time)} ms`}
        </p>
      </div>
      <ol className="sp-results" role="list">
        {results.map(({ startup, score }, index) => (
          <Result
            key={startup.id ?? `${startup.name}-${index}`}
            startup={startup}
            score={score}
            onVisit={() => onVisit(startup.id, index)}
          />
        ))}
      </ol>
    </div>
  );
}
