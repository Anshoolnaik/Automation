import { describe, expect, it } from 'vitest';

import { REDACTED, redactText, redactValue, sanitizeErrorMessage } from './redact.js';

describe('redactText', () => {
  it('redacts sensitive query parameters but keeps harmless ones', () => {
    const url = 'https://example.com/cb?code=abc123&state=xyz&access_token=secret&page=2';
    expect(redactText(url)).toBe(
      `https://example.com/cb?code=${REDACTED}&state=xyz&access_token=${REDACTED}&page=2`,
    );
  });

  it('redacts bearer tokens, cookie headers, JWTs and URL credentials', () => {
    expect(redactText('Authorization: Bearer abc.def.ghi')).toContain(`Bearer ${REDACTED}`);
    expect(redactText('Cookie: SID=1; HSID=2')).toBe(`Cookie: ${REDACTED}`);
    expect(redactText('token eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4f')).toBe(
      `token ${REDACTED}`,
    );
    expect(redactText('https://user:hunter2@example.com/path')).toBe(
      `https://${REDACTED}@example.com/path`,
    );
  });

  it('leaves ordinary text untouched', () => {
    expect(redactText('Opening wikipedia.org')).toBe('Opening wikipedia.org');
    expect(redactText('https://en.wikipedia.org/wiki/Alan_Turing')).toBe(
      'https://en.wikipedia.org/wiki/Alan_Turing',
    );
  });

  it('strips ANSI escape codes', () => {
    expect(redactText('[31mfailed[39m')).toBe('failed');
  });
});

describe('redactValue', () => {
  it('redacts sensitive keys at any depth', () => {
    const result = redactValue({
      url: 'https://example.com',
      nested: { password: 'p', cookies: ['a'], headers: { Authorization: 'x' } },
      sessionId: 'abc',
    });
    expect(result).toEqual({
      url: 'https://example.com',
      nested: { password: REDACTED, cookies: REDACTED, headers: { Authorization: REDACTED } },
      sessionId: REDACTED,
    });
  });

  it('handles circular references, errors and dates', () => {
    const value: Record<string, unknown> = { when: new Date('2026-01-01T00:00:00Z') };
    value.self = value;
    value.error = new Error('boom');
    expect(redactValue(value)).toEqual({
      when: '2026-01-01T00:00:00.000Z',
      self: '[Circular]',
      error: { name: 'Error', message: 'boom' },
    });
  });
});

describe('sanitizeErrorMessage', () => {
  it('drops Playwright call logs and collapses whitespace', () => {
    const error = new Error(
      'page.goto: Timeout 30000ms exceeded.\n=========================== logs ===========================\nnavigating to "https://x.com/?token=1"',
    );
    expect(sanitizeErrorMessage(error)).toBe('page.goto: Timeout 30000ms exceeded.');
  });

  it('redacts secrets and truncates long messages', () => {
    expect(sanitizeErrorMessage('failed https://a.com/?session=zzz')).toBe(
      `failed https://a.com/?session=${REDACTED}`,
    );
    expect(sanitizeErrorMessage('x'.repeat(50), 10)).toBe('xxxxxxxxxx…[truncated]');
  });

  it('handles non-error values', () => {
    expect(sanitizeErrorMessage({ reason: 'nope' })).toBe('{"reason":"nope"}');
    expect(sanitizeErrorMessage(undefined)).toBe('Unknown error');
  });
});
