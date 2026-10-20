import { useRef } from 'react';

import Ending from './band/Ending';
import { EXPERIENCE, OFF_CLOCK, ON_CAMPUS, PROJECTS, SKILLS } from './content';
import Header from './Header';
import RowSection from './RowSection';
import { useHomeDocument } from './useHomeDocument';
import { useRowMotion } from './useRowMotion';
import WritingSection from './WritingSection';
import './home.css';

/**
 * The homepage at "/": a one-page ledger of experience, projects and writing that ends by going
 * under the surface (the band). Everything is scoped under .hm so it cannot touch other pages.
 */
export default function HomePage() {
  const root = useRef(null);
  useHomeDocument();
  useRowMotion(root);

  return (
    <div className="hm" ref={root}>
      <Header />
      <main className="wrap">
        <RowSection section={EXPERIENCE} />
        <RowSection section={ON_CAMPUS} />
        <RowSection section={PROJECTS} />
        <WritingSection />
        <RowSection section={OFF_CLOCK} />
        <RowSection section={SKILLS} />
      </main>
      <Ending />
    </div>
  );
}
