import { Search, X } from 'lucide-react';

/**
 * The query field. While a search runs the input is readOnly, not disabled: a disabled input
 * drops focus and takes the caret out of the tab order mid-search. The clear button stays live
 * during a search so a slow or cold API can always be walked away from.
 */
export default function SearchBox({ value, loading, inputRef, onChange, onSubmit, onClear }) {
  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form role="search" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="sp-query">Search climate startups</label>
      <div className="sp-search-field" data-busy={loading || undefined}>
        <Search className="sp-search-icon" size={16} aria-hidden="true" />
        <input
          id="sp-query"
          ref={inputRef}
          className="sp-input"
          type="text"
          value={value}
          readOnly={loading}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Search climate startups"
          aria-describedby="sp-query-hint"
          onChange={(event) => onChange(event.target.value)}
        />
        {loading && <span className="sp-ring" aria-hidden="true" />}
        {value && (
          <button type="button" className="sp-search-clear" aria-label="Clear search" onClick={onClear}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="sp-status sp-search-hint" id="sp-query-hint">
        Try &quot;solar panels&quot;, &quot;carbon capture&quot; or &quot;EV charging&quot;, then press Enter.
      </p>
    </form>
  );
}
