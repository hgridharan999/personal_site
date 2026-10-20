import { Fragment } from 'react';
import { Link } from 'react-router-dom';

import { CONTACT_LINKS, FOOTER } from '../home/content';
import { SmartLink } from '../home/rows';

/**
 * The homepage's ending without the water: how to reach Hari, then the legal page and the date
 * the site was last updated. Copy and links come from home/content.js so both stay in step.
 */
export default function SiteFooter() {
  const { open, updated } = FOOTER;
  return (
    <footer className="wrap sp-end">
      <p className="sp-end-open">{open}</p>
      <p className="sp-end-links">
        {CONTACT_LINKS.map(({ label, href, arrow, sr }, index) => (
          <Fragment key={href}>
            {index > 0 && <span className="sp-dot" aria-hidden="true">{' · '}</span>}
            <SmartLink href={href} arrow={arrow} sr={sr}>{label}</SmartLink>
          </Fragment>
        ))}
      </p>
      <p className="sp-end-fine">
        <Link to="/privacy">Privacy</Link>
        <span className="sp-dot" aria-hidden="true">{' · '}</span>
        {updated.label} <time dateTime={updated.datetime}>{updated.date}</time>
      </p>
    </footer>
  );
}
