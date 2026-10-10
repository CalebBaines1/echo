import { describe, expect, it } from 'vitest';
import { speechChunks } from './say';

describe('speechChunks', () => {
  it('starts with the first sentence alone', () => {
    const c = speechChunks('Records first. Then coffee at The Uncommons, which is close. It suits everyone!');
    expect(c[0]).toBe('Records first.');
    expect(c.join(' ')).toBe('Records first. Then coffee at The Uncommons, which is close. It suits everyone!');
  });
  it('keeps text without punctuation whole', () => {
    expect(speechChunks('Loving it on the first visit')).toEqual(['Loving it on the first visit']);
  });
});
