import { describe, expect, it } from 'vitest';

import { dropPrivatePages } from './analytics';

const at = (path) => ({ type: 'pageview', url: `https://www.harigridharan.com${path}` });

describe('dropPrivatePages', () => {
  it('keeps public pages', () => {
    for (const path of ['/', '/writing', '/blog/satisfaction-and-peace', '/hiking', '/notes', '/memo']) {
      expect(dropPrivatePages(at(path)), path).toEqual(at(path));
    }
  });

  it('drops the signed-in pages', () => {
    for (const path of ['/login', '/me', '/me/', '/me/poker/table/abc', '/nightly', '/nightly?x=1']) {
      expect(dropPrivatePages(at(path)), path).toBeNull();
    }
  });
});
