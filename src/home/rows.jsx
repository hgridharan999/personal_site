import { Fragment } from 'react';
import { Link } from 'react-router-dom';

import { A11Y, NBSP } from './content';
import { yearsOf } from './years';

// A path with a file extension (the resume PDF) is a download, so the router must not handle it.
const isRoute = (href) => href.startsWith('/') && !/\.[a-z0-9]+$/i.test(href);

function kindOf(href) {
  if (isRoute(href)) return 'route';
  if (href.startsWith('https:')) return 'external';
  return 'plain';
}

// Direction glyph for action links when `arrow` is just `true`; plain links name theirs explicitly.
const DEFAULT_GLYPH = { route: '→', external: '↗' };

/**
 * One link component for every kind of href on the page.
 * - Site routes use the router's <Link> so navigation stays client-side.
 * - https: links open in a new tab and say so to screen readers.
 * - Anything else (mailto:, the resume PDF) is a plain <a>.
 * `arrow` adds a decorative glyph after the label: `true` picks one for the link kind, a string
 * (like '↓' for the PDF) names it. Company names (a.org) leave it off. `sr` is the screen-reader
 * text that says what the link does; new-tab links get a default.
 */
export function SmartLink({ href, className, sr, arrow = false, children }) {
  const kind = kindOf(href);
  const glyph = typeof arrow === 'string' ? arrow : arrow && DEFAULT_GLYPH[kind];
  const suffix = kind === 'external' ? sr ?? A11Y.newTab : sr;
  const label = (
    <>
      {children}
      {glyph && <span aria-hidden="true">{NBSP}{glyph}</span>}
      {suffix && <span className="sr-only">{suffix}</span>}
    </>
  );

  if (kind === 'route') return <Link className={className} to={href}>{label}</Link>;
  if (kind === 'external') {
    return <a className={className} href={href} target="_blank" rel="noopener">{label}</a>;
  }
  return <a className={className} href={href}>{label}</a>;
}

/** Text with inline company links: a string, or an array of strings and { text, href } segments. */
function Segments({ items }) {
  return [].concat(items ?? []).map((segment, index) => (
    <Fragment key={index}>
      {typeof segment === 'string'
        ? segment
        : <SmartLink className="org" href={segment.href}>{segment.text}</SmartLink>}
    </Fragment>
  ));
}

/**
 * Role and company on one line, with an optional quiet location or venue after it. `mark` adds
 * the open/close icon after the company: decorative, since the summary below carries the state.
 */
export function Ttl({ role, co, coHref, loc, mark = false }) {
  return (
    <span className="ttl">
      {role && <><span className="role">{role},</span>{' '}</>}
      <span className="co">
        {coHref ? <SmartLink className="org" href={coHref}>{co}</SmartLink> : co}
        {mark && <span className="xp-mark" aria-hidden="true" />}
      </span>
      {loc && <>{' '}<span className="loc">{loc}</span></>}
    </span>
  );
}

/** The one-liner under a title: a highlighted lead, then text that may hold inline company links. */
function Line({ as: Tag, lead, rest }) {
  return (
    <Tag className="line">
      <span className="lead">{lead}</span>
      <Segments items={rest} />
    </Tag>
  );
}

/** Small print under a row's story: plain facts and links, joined by middle dots. */
export function Meta({ items }) {
  return (
    <p className="meta">
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && ' · '}
          {typeof item === 'string'
            ? item
            : <SmartLink href={item.href} sr={item.sr} arrow>{item.label}</SmartLink>}
        </Fragment>
      ))}
    </p>
  );
}

/**
 * A row that opens. The title row (with its company link) sits above the <details>, not inside
 * the <summary>: a link inside a summary is a control nested in a control, which assistive tech
 * cannot reliably announce or operate. The summary is just the one-liner and is the only thing
 * the keyboard toggles; useRowMotion forwards mouse clicks on the title row to it. The
 * <details> stays uncontrolled so the browser owns open state and find-in-page.
 */
export function XpRow({ row }) {
  const { when, lead, rest, body, meta } = row;
  return (
    <li className="row xp">
      <div className="xp-head">
        <Ttl {...row} mark />
        {when && <span className="when">{yearsOf(when)}</span>}
      </div>
      <details>
        <summary><Line as="span" lead={lead} rest={rest} /></summary>
        <div className="body">
          {body.map((text, index) => <p key={index}><Segments items={text} /></p>)}
          {meta && <Meta items={meta} />}
        </div>
      </details>
    </li>
  );
}

/** A row with nothing to open: the title, a date and the one-liner sit on the page itself. */
export function PlainRow({ row }) {
  const { when, lead, rest } = row;
  return (
    <li className="row row--plain">
      <Ttl {...row} />
      {when && <span className="when">{yearsOf(when)}</span>}
      {lead && <Line as="p" lead={lead} rest={rest} />}
    </li>
  );
}
