import matter from 'gray-matter';
import { Buffer } from 'buffer';

// Make Buffer available globally for gray-matter
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
}

// Import all markdown files
const modules = import.meta.glob('./posts/*.md', { eager: false, query: '?raw', import: 'default' });

// Returns sorted array of post metadata (no body) for the listing page.
export async function getAllPosts() {
  console.log('getAllPosts called');
  console.log('modules:', modules);
  const posts = [];
  for (const path in modules) {
    console.log('Loading:', path);
    const raw = await modules[path]();
    console.log('Raw content:', raw?.substring(0, 100));
    const { data } = matter(raw);
    const slug = data.slug || path.replace('./posts/', '').replace('.md', '');
    posts.push({ slug, ...data });
  }
  console.log('Final posts:', posts);
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
