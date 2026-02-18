import matter from 'gray-matter';

// Vite's import.meta.glob with { as: 'raw' } loads .md files as raw strings at build time.
// eager: false means each file is a lazy dynamic import.
const modules = import.meta.glob('./posts/*.md', { query: '?raw', import: 'default', eager: false });

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
