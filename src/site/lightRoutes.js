// The routes that wear the homepage's light UI: "/" and every page it links to. One definition
// for the tests; the pre-paint script in index.html cannot import it, so
// it repeats the list and lightRoutes.test.js keeps the two in step. /login and /me stay dark.
export const LIGHT_PATH = /^\/(?:|hiking|theses|climate-search|privacy|terms|legal|blog\/[^/]+)\/?$/i;

export const isLightPath = (path) => LIGHT_PATH.test(path);
