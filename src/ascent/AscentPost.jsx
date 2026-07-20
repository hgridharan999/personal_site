import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ReactLenis, useLenis } from 'lenis/react';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft } from 'lucide-react';
import { gsap, ScrollTrigger } from '../lib/gsap';
import Cursor from './Cursor';
import { getPostBySlug } from '../blog/index.js';
import './ascent.css';

/**
 * Long-form blog post reader in the Ascent style — smooth-scroll, dark editorial
 * typography (Archivo headings, Instrument-Serif prose, amber links).
 */
export default function AscentPost() {
  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.2, smoothWheel: true }}>
      <PostInner />
    </ReactLenis>
  );
}

function PostInner() {
  const { slug } = useParams();
  const lenis = useLenis();
  const [post, setPost] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#0B0A0A';
    window.scrollTo(0, 0);
    getPostBySlug(slug).then((r) => (r ? setPost(r) : setNotFound(true)));
    return () => { document.body.style.background = prev; };
  }, [slug]);

  useEffect(() => {
    if (!lenis) return;
    const onScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onScroll);
    const raf = (t) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => { lenis.off('scroll', onScroll); gsap.ticker.remove(raf); };
  }, [lenis]);

  const Bar = (
    <div className="asc-topbar" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: 'linear-gradient(to bottom, rgba(11,10,10,0.92), rgba(11,10,10,0))' }}>
      <Link to="/theses" data-hot className="asc-back asc-mono">
        <ArrowLeft size={14} /> <span className="b-name">Theses</span>
      </Link>
    </div>
  );

  if (notFound) {
    return (
      <div className="asc" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Cursor />
        <p className="asc-h" style={{ fontSize: 'clamp(28px,4vw,44px)' }}>Post not found.</p>
        <Link to="/theses" data-hot className="asc-link asc-mono">← Back to Theses</Link>
      </div>
    );
  }
  if (!post) {
    return (
      <div className="asc" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="asc-mono" style={{ color: 'var(--muted)' }}>Loading…</span>
      </div>
    );
  }

  return (
    <div className="asc" style={{ minHeight: '100vh' }}>
      <Cursor />
      {Bar}
      <article style={{ width: 'min(92vw, 760px)', margin: '0 auto', padding: 'clamp(84px, 16vh, 150px) 0 clamp(60px, 14vh, 140px)' }}>
        <span className="asc-mono asc-amber">{post.frontmatter.date}</span>
        <h1 className="asc-h" style={{ fontSize: 'clamp(36px, 5.6vw, 74px)', margin: 'clamp(14px,2.6vh,24px) 0 clamp(28px,5vh,50px)' }}>
          {post.frontmatter.title}
        </h1>
        <div className="asc-prose">
          <ReactMarkdown>{post.content}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
