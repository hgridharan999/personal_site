import { useEffect } from 'react';
import Cursor from '../ascent/Cursor';
import '../ascent/ascent.css';
import './private.css';

/** Dark Ascent frame for the private pages; also keeps them out of search indexes. */
export default function PrivateShell({ children, className = '' }) {
  useEffect(() => {
    const prevBg = document.body.style.background;
    document.body.style.background = '#0B0A0A';
    // index.html ships its own robots meta — override it rather than adding a second tag.
    const existing = document.querySelector('meta[name="robots"]');
    const meta = existing || Object.assign(document.createElement('meta'), { name: 'robots' });
    const prevContent = existing?.content;
    meta.content = 'noindex, nofollow';
    if (!existing) document.head.appendChild(meta);
    return () => {
      document.body.style.background = prevBg;
      if (existing) existing.content = prevContent;
      else meta.remove();
    };
  }, []);

  return (
    <div className={`asc prv ${className}`}>
      <Cursor />
      {children}
    </div>
  );
}
