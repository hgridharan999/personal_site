import { useEffect } from 'react';

/**
 * Keeps a private page out of search indexes while it is mounted. index.html ships its own robots
 * meta, so this overrides that tag and puts it back on unmount (or removes one it had to add).
 */
export function useNoindex(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const existing = document.querySelector('meta[name="robots"]');
    const meta = existing || Object.assign(document.createElement('meta'), { name: 'robots' });
    const previous = existing?.content;
    meta.content = 'noindex, nofollow';
    if (!existing) document.head.appendChild(meta);
    return () => {
      if (existing) existing.content = previous;
      else meta.remove();
    };
  }, [enabled]);
}
