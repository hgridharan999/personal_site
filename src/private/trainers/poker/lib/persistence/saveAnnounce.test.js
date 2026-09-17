import { describe, it, expect } from 'vitest';
import { nextSaveAnnouncement, ANNOUNCE_AFTER_MS, STILL_SAVING_TEXT } from './saveAnnounce.js';

describe('nextSaveAnnouncement', () => {
  it('says nothing while not saving, and clears the mark', () => {
    const { text, mark } = nextSaveAnnouncement({ pendingSince: 0, announced: true }, 'saved', 1000);
    expect(text).toBe('');
    expect(mark).toEqual({ pendingSince: null, announced: false });
  });

  it('says nothing right after a saving stretch starts', () => {
    const { text, mark } = nextSaveAnnouncement(null, 'saving', 0);
    expect(text).toBe('');
    expect(mark).toEqual({ pendingSince: 0, announced: false });
  });

  it('stays quiet before the threshold', () => {
    const { text, mark } = nextSaveAnnouncement({ pendingSince: 0, announced: false }, 'saving', ANNOUNCE_AFTER_MS - 1);
    expect(text).toBe('');
    expect(mark).toEqual({ pendingSince: 0, announced: false });
  });

  it('announces once the threshold is crossed', () => {
    const { text, mark } = nextSaveAnnouncement({ pendingSince: 0, announced: false }, 'saving', ANNOUNCE_AFTER_MS);
    expect(text).toBe(STILL_SAVING_TEXT);
    expect(mark).toEqual({ pendingSince: 0, announced: true });
  });

  it('does not repeat once announced, even while still saving well past the threshold', () => {
    const { text, mark } = nextSaveAnnouncement({ pendingSince: 0, announced: true }, 'saving', ANNOUNCE_AFTER_MS * 3);
    expect(text).toBe('');
    expect(mark).toEqual({ pendingSince: 0, announced: true });
  });

  it('a fresh stretch (no prior mark) starts its own timer from now', () => {
    const { mark } = nextSaveAnnouncement(null, 'saving', 5000);
    expect(mark.pendingSince).toBe(5000);
  });

  it('leaving and re-entering saving resets so the next stretch gets announced again', () => {
    const stopped = nextSaveAnnouncement({ pendingSince: 0, announced: true }, 'saved', 20_000);
    const restarted = nextSaveAnnouncement(stopped.mark, 'saving', 20_000);
    expect(restarted).toEqual({ text: '', mark: { pendingSince: 20_000, announced: false } });
  });
});
