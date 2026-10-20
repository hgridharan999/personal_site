import { PlainRow, XpRow } from './rows';

/**
 * A labelled ledger section. A row with a body opens; one without stays a plain line, so the
 * content file decides each row's kind and this component never needs a flag.
 */
export default function RowSection({ section }) {
  const { id, title, rows, also } = section;
  return (
    <section aria-labelledby={id}>
      <h2 className="head" id={id}>{title}</h2>
      {/* role="list" keeps the list announced as a list even though the markers are hidden. */}
      <ul role="list">
        {rows.map((row) => (row.body
          ? <XpRow key={row.co} row={row} />
          : <PlainRow key={row.co} row={row} />))}
      </ul>
      {also && <p className="also">{also}</p>}
    </section>
  );
}
