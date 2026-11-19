// Vercel Web Analytics counts public page views only. The signed-in pages (/login, /me and
// everything under it, /nightly) are dropped before anything is sent.
const PRIVATE = /^\/(login|me|nightly)(\/|$)/;

/** beforeSend for <Analytics />: the event unchanged, or null for a private page. */
export function dropPrivatePages(event) {
  let path;
  try {
    path = new URL(event.url).pathname;
  } catch {
    return event;
  }
  return PRIVATE.test(path) ? null : event;
}
