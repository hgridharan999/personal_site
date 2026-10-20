import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

import { getPostBySlug } from '../blog/index.js';
import { NBSP, WRITING } from '../home/content';
import { SmartLink } from '../home/rows';
import { EssayRow } from '../home/WritingSection';
import SiteShell from './SiteShell';
import { formatLongDate } from './format';
import './writing.css';

/** Markdown links go through the same component as every other link, so https: ones open a new tab. */
function ProseLink({ href, children }) {
  return href ? <SmartLink href={href}>{children}</SmartLink> : <>{children}</>;
}
// Module level, so the object keeps its identity and the markdown tree is not rebuilt on every render.
const MARKDOWN_COMPONENTS = { a: ProseLink };

/** The other essays, then the way back to the ten bullet points. */
function MoreWriting({ slug }) {
  const { thesesLink, essays } = WRITING;
  return (
    <section className="sp-more" aria-labelledby="sp-more-head">
      <h2 className="head" id="sp-more-head">More writing</h2>
      <ul role="list" className="theses-more essays">
        {essays.filter((essay) => essay.slug !== slug).map((essay) => <EssayRow key={essay.slug} essay={essay} />)}
        <li className="row row--link">
          <SmartLink className="rl" href={thesesLink.href}>
            <span className="lab co">{thesesLink.label}<span aria-hidden="true">{NBSP}→</span></span>
          </SmartLink>
        </li>
      </ul>
    </section>
  );
}

/**
 * One post, read from src/blog. `loaded` remembers which slug it holds, so a result that arrives
 * after the visitor moved on is never shown under the wrong URL, and a changed slug reads as
 * "loading" on the very next render with no effect needed to reset anything.
 */
export default function PostPage() {
  const { slug } = useParams();
  const [loaded, setLoaded] = useState({ slug: null, post: null });

  useEffect(() => {
    let live = true;
    const finish = (post) => { if (live) setLoaded({ slug, post }); };
    getPostBySlug(slug).then(finish, () => finish(null));
    return () => { live = false; };
  }, [slug]);

  if (loaded.slug !== slug) {
    return <SiteShell docTitle="Writing"><p className="sp-status" role="status">Loading…</p></SiteShell>;
  }
  if (!loaded.post) {
    return (
      <SiteShell title="Post not found" intro="There is no post at this address.">
        <p className="sp-text sp-lost"><SmartLink href="/theses" arrow>See the essays</SmartLink></p>
      </SiteShell>
    );
  }

  const { frontmatter, content } = loaded.post;
  return (
    <SiteShell docTitle={frontmatter.title}>
      <article>
        <time className="sp-date" dateTime={String(frontmatter.date)}>{formatLongDate(frontmatter.date)}</time>
        <h1 className="sp-title sp-title--essay">{frontmatter.title}</h1>
        <div className="sp-prose">
          <ReactMarkdown components={MARKDOWN_COMPONENTS}>{content}</ReactMarkdown>
        </div>
      </article>
      <MoreWriting slug={slug} />
    </SiteShell>
  );
}
