import { useCallback, useEffect, useState } from 'react';
import { getLocalFeedItems } from '../blog/index.js';
import { getRemoteFeedItems } from '../utils/postsApi';
import { staticLinkedInPosts } from '../data/staticLinkedInPosts.js';

function sortByDateDesc(items) {
  return [...items].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function dedupe(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = item.id || `${item.source}:${item.title}:${item.publishedAt}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

export function useUnifiedFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [localItems, remoteItems] = await Promise.all([
        getLocalFeedItems(),
        getRemoteFeedItems().catch((err) => {
          console.warn('LinkedIn feed unavailable, rendering local posts only.', err);
          return [];
        }),
      ]);

      const merged = sortByDateDesc(dedupe([...localItems, ...remoteItems, ...staticLinkedInPosts]));
      setItems(merged);
    } catch (err) {
      console.error('Unified feed error:', err);
      setError(err.message || 'Failed to load posts.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  return {
    items,
    loading,
    error,
    refresh: loadFeed,
  };
}
