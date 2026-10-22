import { PRINCIPLES, PUBLISHED_THESES } from '../ascent/data';
import { NBSP, WRITING } from '../home/content';
import { SmartLink } from '../home/rows';
import { EssayRow } from '../home/WritingSection';
import SiteShell from './SiteShell';
import { formatMonthYear } from './format';
import './writing.css';

/** One published thesis: it lives on Medium, so it is an external link with its kind under the title. */
function ThesisRow({ thesis }) {
  return (
    <li className="row row--link">
      <SmartLink className="rl rl--essay" href={thesis.url}>
        <span className="et">
          <span className="lab co">
            {thesis.title}
            <span aria-hidden="true">{NBSP}↗</span>
          </span>
          <span className="sp-kind">{thesis.kind}</span>
        </span>
        <span className="val"><time dateTime={thesis.date}>{formatMonthYear(thesis.date)}</time></span>
      </SmartLink>
    </li>
  );
}

/**
 * Writing, in three parts: ten lines about me, the essays (the same rows the homepage lists, from
 * the same data), and the investment and research theses once one is published.
 */
export default function WritingPage() {
  const { title, note, essaysLabel, essays } = WRITING;
  return (
    <SiteShell title={title}>
      <section aria-labelledby="sp-points-head">
        <h2 className="head" id="sp-points-head">Me in 10 bullet points</h2>
        <ol role="list" className="sp-points">
          {PRINCIPLES.map((text, index) => (
            <li key={text}>
              {/* the list already numbers the items for a screen reader */}
              <span className="sp-pn" aria-hidden="true">{index + 1}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="sp-essays-head">
        <h2 className="head" id="sp-essays-head">{essaysLabel}</h2>
        <p className="note">{note}</p>
        <ul role="list" className="theses-more essays">
          {essays.map((essay) => <EssayRow key={essay.slug} essay={essay} />)}
        </ul>
      </section>

      {PUBLISHED_THESES.length > 0 && (
        <section aria-labelledby="sp-published-head">
          <h2 className="head" id="sp-published-head">Investment and research theses</h2>
          <ul role="list" className="theses-more essays">
            {PUBLISHED_THESES.map((thesis) => <ThesisRow key={thesis.url} thesis={thesis} />)}
          </ul>
        </section>
      )}
    </SiteShell>
  );
}
