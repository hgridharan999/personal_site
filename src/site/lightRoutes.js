// The routes that wear the homepage's light UI: "/", every page it links to, and the two private
// pages that share its look (/login and /nightly). One definition for the tests; the pre-paint
// script in index.html cannot import it, so it repeats the list and lightRoutes.test.js keeps the
// two in step. /me and the trainers stay dark.
export const LIGHT_PATH = /^\/(?:|hiking|writing|notes|climate-search|privacy|terms|legal|login|nightly|blog\/[^/]+)\/?$/i;

export const isLightPath = (path) => LIGHT_PATH.test(path);
