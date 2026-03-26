import matter from 'gray-matter';
import { Buffer } from 'buffer';

// Make Buffer available globally for gray-matter
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
}

// Import all markdown files
const modules = import.meta.glob('./posts/*.md', { eager: false, query: '?raw', import: 'default' });

function toIsoDate(dateValue) {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }
  return parsed.toISOString();
}

function getExcerpt(frontmatter = {}, content = '') {
  if (frontmatter.description) {
    return frontmatter.description;
  }

  const firstParagraph = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'));

  if (!firstParagraph) {
    return 'No description yet.';
  }

  return firstParagraph.slice(0, 180);
}

// Returns sorted array of post metadata (no body) for the listing page.
export async function getAllPosts() {
  const posts = [];
  for (const path in modules) {
    const raw = await modules[path]();
    const { data } = matter(raw);
    const slug = data.slug || path.replace('./posts/', '').replace('.md', '');
    posts.push({ slug, ...data });
  }
  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Returns { frontmatter, content } for a single post matched by slug.
export async function getPostBySlug(slug) {
  for (const path in modules) {
    const raw = await modules[path]();
    const { data, content } = matter(raw);
    const fileSlug = data.slug || path.replace('./posts/', '').replace('.md', '');
    if (fileSlug === slug) return { frontmatter: data, content };
  }
  return null;
}

// Returns local markdown posts normalized into the shared feed model.
export async function getLocalFeedItems() {
  const items = [];

  for (const path in modules) {
    const raw = await modules[path]();
    const { data, content } = matter(raw);
    const slug = data.slug || path.replace('./posts/', '').replace('.md', '');

    items.push({
      id: `local:${slug}`,
      source: 'blog',
      sourceLabel: 'Blog',
      title: data.title || slug,
      excerpt: getExcerpt(data, content),
      publishedAt: toIsoDate(data.date),
      displayDate: data.date || 'Unknown date',
      internalSlug: slug,
      externalUrl: null,
    });
  }

  return items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}
