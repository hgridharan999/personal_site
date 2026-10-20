import { useRef, useState } from 'react';
import { SmartLink } from '../../home/rows';
import { useClimateSearch } from '../../hooks/useClimateSearch';
import SiteShell from '../SiteShell';
import { useMediaQuery } from '../useMediaQuery';
import './climate.css';
import Filters from './Filters';
import Results from './Results';
import SearchBox from './SearchBox';
import { Failure, Prompt, Searching } from './SearchStates';
import Stats from './Stats';
import { EMPTY_FORM, EXAMPLES, activeCount, announcement, errorText, sameFilters, toParams } from './search';

const REPO = 'https://github.com/hgridharan999/climate_tech_discovery_backend';
const INTRO = 'A search engine for 212 climate startups, with results in about half a second.';
const START = 'Describe a technology, a problem or a sector. Results are ranked by meaning and by keyword.';

export default function ClimateSearchPage() {
  const { results, loading, error, searchInfo, debouncedSearch, logClick, clearResults } = useClimateSearch();
  const sideBySide = useMediaQuery('(min-width: 960px)');
  const [draft, setDraft] = useState('');  // what is typed
  const [query, setQuery] = useState('');  // what was last submitted; every state below keys off it
  const [form, setForm] = useState(EMPTY_FORM);
  const inputRef = useRef(null);
  const bodyRef = useRef(null);

  const run = (text, nextForm) => {
    const q = text.trim();
    setQuery(q);
    if (q) debouncedSearch({ query: q, top_k: 20, ...toParams(nextForm) });
    else clearResults();
  };
  // Chips and the retry button unmount when a search starts, which would drop focus to <body>.
  // The named results region stays put, so focus moves there (not to the input: that opens a phone keyboard).
  const rerun = (text) => { run(text, form); bodyRef.current?.focus({ preventScroll: true }); };
  const changeForm = (next) => { setForm(next); if (query && !sameFilters(form, next)) run(query, next); };
  const submit = () => { if (draft.trim()) run(draft, form); };
  const clear = () => { setDraft(''); run('', form); inputRef.current?.focus(); };
  const pick = (term) => { setDraft(term); rerun(term); };

  const filtered = activeCount(form) > 0;
  const filters = (
    <Filters form={form} showTitle={sideBySide} onChange={changeForm} onClear={() => changeForm(EMPTY_FORM)} />
  );

  // One branch per state, in priority order. `query` guards all of them: the hook cannot cancel
  // a debounced search, so one sent just before Clear still lands and must not show.
  let body;
  if (!query) {
    body = <Prompt title="Start with a topic." hint={START} terms={EXAMPLES} onPick={pick} />;
  } else if (loading) {
    body = <Searching />;
  } else if (error) {
    body = <Failure message={errorText(error)} onRetry={() => rerun(query)} />;
  } else if (results.length === 0) {
    const hint = filtered ? 'Try a broader term, or clear the filters.' : 'Try a broader term, or one of these.';
    body = <Prompt title={`No startups matched "${query}".`} hint={hint} terms={EXAMPLES.slice(0, 4)} onPick={pick} />;
  } else {
    body = <Results results={results} searchInfo={searchInfo} onVisit={(id, rank) => logClick(query, id, rank, 'click')} />;
  }

  // Mounted once and only its text changes, so screen readers hear every state; a region that
  // mounts along with its message is often skipped.
  const status = announcement({ query, loading, error, count: searchInfo?.totalResults ?? results.length });

  return (
    <SiteShell wide title="Climate startup search" intro={INTRO}>
      <p className="sp-status sp-cs-meta">
        Python · FastAPI · FAISS · BM25 + BERT ·{' '}
        <SmartLink href={REPO} sr=" on GitHub (opens in new tab)" arrow>Repo</SmartLink>
      </p>
      <div className="sp-cs">
        <div className="sp-cs-main">
          <SearchBox
            value={draft}
            loading={loading && Boolean(query)}
            inputRef={inputRef}
            onChange={setDraft}
            onSubmit={submit}
            onClear={clear}
          />
          {!sideBySide && (
            <details className="sp-disclosure sp-cs-filters">
              <summary>
                Filters{filtered && ` (${activeCount(form)})`}
                <span className="xp-mark" aria-hidden="true" />
              </summary>
              {filters}
            </details>
          )}
          <p className="sr-only" role="status">{status}</p>
          <section className="sp-cs-body" ref={bodyRef} tabIndex={-1} aria-label="Search results">{body}</section>
        </div>
        <aside className="sp-cs-aside" aria-label="Filters and database stats">
          {sideBySide && filters}
          <Stats />
        </aside>
      </div>
    </SiteShell>
  );
}
