import { HEADER, NBSP } from './content';
import HikerMark from './HikerMark';
import { ICONS } from './icons';
import MountainPlate from './MountainPlate';
import { SmartLink } from './rows';

/**
 * Email, LinkedIn, GitHub and the resume as a row of quiet icons. Each is a real link with a 40px
 * target: its name is screen-reader text (SmartLink adds "opens in new tab", the data adds "(PDF)"),
 * and a small word label shows under the icon on hover and focus. An icon name with no drawing falls
 * back to the plain word, so a typo in content.js can never blank the page.
 */
function Actions() {
  const { resume, email, social } = HEADER.actions;
  return (
    <div className="act">
      {[email, ...social, resume].map(({ label, href, icon, sr }) => {
        const Icon = ICONS[icon];
        return (
          <SmartLink key={href} className="ico" href={href} sr={sr}>
            {Icon ? (
              <>
                <Icon />
                <span className="sr-only">{label}</span>
                <span className="ico-tip" aria-hidden="true">{label}</span>
              </>
            ) : label}
          </SmartLink>
        );
      })}
    </div>
  );
}

/**
 * The lockup: hiker mark beside the name, then affiliation, what he is looking for and the contact
 * icons. On wide screens the mountain plate sits behind the right-hand side.
 */
export default function Header() {
  const { name, affiliation, seek } = HEADER;
  return (
    <header className="wrap">
      <MountainPlate />
      <div className="top">
        <HikerMark />
        <h1 className="name">
          <span className="hari">{name.first}</span>{' '}
          <span className="sur">{name.last}</span>
        </h1>
        <p className="aff">
          <span className="aff-a nw">{affiliation.school}</span>
          <span className="aff-sep">{NBSP}· </span>
          <span className="nw">{affiliation.fellowship}</span>
          {' · '}
          <span className="nw">{affiliation.major}</span>
        </p>
        <p className="seek">
          <span className="seek-intro">{seek.intro}</span>
          {seek.rest}
        </p>
        <Actions />
      </div>
    </header>
  );
}
