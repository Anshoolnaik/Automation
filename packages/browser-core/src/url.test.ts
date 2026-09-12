import { describe, expect, it } from 'vitest';

import { BrowserError } from './errors.js';
import { normalizeNavigableUrl } from './url.js';

describe('normalizeNavigableUrl', () => {
  it.each([
    ['wikipedia.org', 'https://wikipedia.org/'],
    ['  en.wikipedia.org/wiki/Alan_Turing ', 'https://en.wikipedia.org/wiki/Alan_Turing'],
    ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['HTTP://Example.com', 'http://example.com/'],
    ['localhost:3000/test', 'https://localhost:3000/test'],
    ['http://127.0.0.1:8080/page.html', 'http://127.0.0.1:8080/page.html'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeNavigableUrl(input).href).toBe(expected);
  });

  it.each([
    '',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'chrome://settings',
    'data:text/html,hi',
    'not a url',
    'https://user:pass@example.com',
  ])('rejects %s', (input) => {
    expect(() => normalizeNavigableUrl(input)).toThrow(BrowserError);
  });

  it('reports the INVALID_URL code', () => {
    try {
      normalizeNavigableUrl('ftp://example.com');
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_URL', operation: 'goto' });
    }
  });
});
