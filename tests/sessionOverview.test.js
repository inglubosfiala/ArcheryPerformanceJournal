import { describe, it, expect } from 'vitest';
import { insertAtCursor } from '../public/js/app/views/sessionOverview.js';

describe('review cue chips: inserting a word at the cursor', () => {
  it('puts the word into an empty text', () => {
    expect(insertAtCursor('', 0, 0, 'Bow arm')).toEqual({ text: 'Bow arm', cursor: 7 });
  });

  it('adds a space before it when it would stick to the previous word', () => {
    expect(insertAtCursor('work on', 7, 7, 'Bow arm')).toEqual({ text: 'work on Bow arm', cursor: 15 });
    expect(insertAtCursor('work on ', 8, 8, 'Bow arm')).toEqual({ text: 'work on Bow arm', cursor: 15 });
  });

  it('adds a space after it when it would stick to the next word, not before punctuation', () => {
    expect(insertAtCursor('more stable', 5, 5, 'Bow arm')).toEqual({ text: 'more Bow arm stable', cursor: 12 });
    expect(insertAtCursor('more , then', 5, 5, 'Rhythm')).toEqual({ text: 'more Rhythm, then', cursor: 11 });
  });

  it('replaces a selection', () => {
    expect(insertAtCursor('keep the XX here', 9, 11, 'Rhythm')).toEqual({ text: 'keep the Rhythm here', cursor: 15 });
  });

  it('works on a new line', () => {
    expect(insertAtCursor('line one\n', 9, 9, 'Expansion')).toEqual({ text: 'line one\nExpansion', cursor: 18 });
  });
});
