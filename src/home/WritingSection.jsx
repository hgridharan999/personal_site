import { Link } from 'react-router-dom';

import { NBSP, WRITING } from './content';
import { yearsOf } from './years';

/** One essay: the title on the left, the year on the right, the whole row is the link. */
export function EssayRow({ essay }) {
  return (
    <li className="row row--link">
      <Link className="rl rl--essay" to={`/blog/${essay.slug}`}>
        <span className="et"><span className="lab co">{essay.title}</span></span>
        <span className="val"><time dateTime={essay.date}>{yearsOf(essay.when)}</time></span>
      </Link>
    </li>
  );
}

/** Writing: the honesty note, memos (none yet), and the essay list ending in the theses link. */
export default function WritingSection() {
  const { id, title, note, memos, essaysLabel, essays, thesesLink } = WRITING;
  return (
    <section aria-labelledby={id}>
      <h2 className="head" id={id}>{title}</h2>
      <p className="note">{note}</p>
      {memos.items.length > 0 && (
        <>
          <h3 className="kicker kicker--sub">{memos.label}</h3>
          <ul role="list" className="theses-more">
            {memos.items.map((memo) => (
              <li key={memo.href} className="row row--link">
                <a className="rl" href={memo.href}><span className="lab co">{memo.title}</span></a>
              </li>
            ))}
          </ul>
          <h3 className="kicker kicker--sub">{essaysLabel}</h3>
        </>
      )}
      <ul role="list" className="theses-more essays">
        {essays.map((essay) => <EssayRow key={essay.slug} essay={essay} />)}
        <li className="row row--link">
          <Link className="rl" to={thesesLink.href}>
            <span className="lab co">
              {thesesLink.label}
              <span aria-hidden="true">{NBSP}→</span>
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
