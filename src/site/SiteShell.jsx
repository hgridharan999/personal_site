import { Link } from 'react-router-dom';

import HikerMark from '../home/HikerMark';
import { useHomeDocument } from '../home/useHomeDocument';
import SiteFooter from './SiteFooter';
import { useDocumentTitle } from './useDocumentTitle';
// home.css carries the tokens and document rules this shell reuses; it ships with the homepage
// already, so importing it here adds no download for a visitor who started on "/".
import '../home/home.css';
import './site.css';

/**
 * The frame every page the homepage links to sits in: a small home link, the page title and
 * intro, the page itself, and the homepage's contact footer. Rendering under .hm gives the page
 * the homepage's tokens and type, and useHomeDocument turns the dark site shell white (also
 * before first paint on client-side navigation).
 *
 * `title` is the visible h1; `docTitle` is the browser tab title and defaults to it. A page with
 * no h1 of its own (a post sets its headline in Instrument Serif) passes only `docTitle`.
 * `wide` opens the column to 1040px for the two-column pages.
 */
export default function SiteShell({ title, docTitle = title, intro, wide = false, children }) {
  useHomeDocument();
  useDocumentTitle(docTitle);

  return (
    <div className={`hm sp${wide ? ' sp-wide' : ''}`}>
      <header className="wrap sp-top">
        <Link to="/" className="sp-home">
          <HikerMark />
          <span className="sp-name"><span className="sp-hari">Hari</span> Gridharan</span>
          <span className="sr-only">, home</span>
        </Link>
      </header>
      <main className="wrap sp-main">
        {title && <h1 className="sp-title">{title}</h1>}
        {intro && <p className="sp-intro">{intro}</p>}
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
