import { describe, expect, it } from 'vitest';
import { normalizeBase, withBase } from './paths';

describe('GitHub Pages paths', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['meeting-notes', '/meeting-notes/'],
    ['/meeting-notes', '/meeting-notes/'],
    ['/meeting-notes/', '/meeting-notes/']
  ])('normalizes %s', (input, expected) => {
    expect(normalizeBase(input)).toBe(expected);
  });

  it('prefixes internal paths exactly once', () => {
    expect(withBase('/meetings/', '/meeting-notes/')).toBe('/meeting-notes/meetings/');
    expect(withBase('meetings/example/', '/meeting-notes/')).toBe(
      '/meeting-notes/meetings/example/'
    );
    expect(withBase('/', '/meeting-notes/')).toBe('/meeting-notes/');
    expect(withBase('/meeting-notes/meetings/', '/meeting-notes/')).toBe(
      '/meeting-notes/meetings/'
    );
    expect(withBase('/meetings/')).toBe('/meetings/');
  });

  it('keeps absolute and fragment links untouched', () => {
    expect(withBase('https://example.com', '/meeting-notes/')).toBe('https://example.com');
    expect(withBase('#content', '/meeting-notes/')).toBe('#content');
  });
});
