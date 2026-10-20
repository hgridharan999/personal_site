import { Fragment } from 'react';

import { A11Y, HEADER, NBSP } from './content';
import HikerMark from './HikerMark';
import MountainPlate from './MountainPlate';
import { SmartLink } from './rows';

/** Resume and Email as buttons, then the two profile links. The resume is a file, so a plain <a>. */
function Actions() {
  const { resume, email, social } = HEADER.actions;
  return (
    <div className="act">
      <a className="btn btn-fill" href={resume.href}>
        {resume.label}
        <span aria-hidden="true">{NBSP}↓</span>
        <span className="sr-only">{A11Y.pdf}</span>
      </a>
      <a className="btn btn-line" href={email.href}>{email.label}</a>
      <span className="soc">
        {social.map((link, index) => (
          <Fragment key={link.href}>
            {index > 0 && <span className="dot" aria-hidden="true">·</span>}
            <SmartLink href={link.href} arrow>{link.label}</SmartLink>
          </Fragment>
        ))}
      </span>
    </div>
  );
}

/**
 * The lockup: hiker mark beside the name, then affiliation, what he is looking for, the actions,
 * On wide screens the mountain plate sits behind the right-hand side.
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
