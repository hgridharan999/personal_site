import { Fragment, useState } from 'react';
import { CONTACT_LINKS, FOOTER } from '../content';
import { SmartLink } from '../rows';

/**
 * The page's last lines: who to reach and how, the last-updated date, and the pause toggle.
 * All copy and links come from content.js. The toggle only exists while there is motion to pause;
 * its visible label flips and nothing else does (a pressed state on top of "Play motion" would read
 * as "Play motion, pressed"). A press is also said once in a status region, which stays empty on
 * load so nothing is announced then.
 */
export default function KiliFooter({ motion, paused, onToggle }) {
  const { open, updated } = FOOTER;
  const [said, setSaid] = useState('');
  const press = () => {
    setSaid(paused ? FOOTER.motion.playing : FOOTER.motion.stopped);
    onToggle();
  };
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
          {motion && (
            <button type="button" className="kili-toggle" onClick={press}>
              {paused ? FOOTER.motion.play : FOOTER.motion.pause}
            </button>
          )}
          <p className="sr-only" role="status">{said}</p>
        </div>
      </div>
    </footer>
  );
}
