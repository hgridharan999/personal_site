import { Fragment } from 'react';
import { CONTACT_LINKS, FOOTER } from '../content';
import { SmartLink } from '../rows';

/**
 * The page's last lines: who to reach and how, and the last-updated date. All copy and links come
 * from content.js. The drawing above only moves for the second or two it takes to draw in, so
 * there is nothing to pause.
 */
export default function KiliFooter() {
  const { open, updated } = FOOTER;
  return (
    <footer className="kili-foot">
      <div className="kili-foot-in">
        <p className="kili-foot-open">{open}</p>
        <p className="kili-foot-contact">
          {CONTACT_LINKS.map(({ label, href, arrow, sr }, i) => (
            <Fragment key={href}>
              {i > 0 && <span className="kili-dot" aria-hidden="true">{' · '}</span>}
              <SmartLink href={href} arrow={arrow} sr={sr}>{label}</SmartLink>
            </Fragment>
          ))}
        </p>
        <div className="kili-foot-line">
          <p>{updated.label} <time dateTime={updated.datetime}>{updated.date}</time></p>
        </div>
      </div>
    </footer>
  );
}
