import { describe, expect, it } from 'vitest';

import { createOriginPolicy, isLoopbackAddress } from './origin-policy.js';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';

describe('createOriginPolicy', () => {
  it('accepts Chrome extension origins', () => {
    expect(createOriginPolicy()(`chrome-extension://${EXTENSION_ID}`)).toBe(true);
  });

  it.each([
    undefined,
    '',
    'null',
    'https://evil.example',
    'http://127.0.0.1:47821',
    'chrome-extension://short',
    `chrome-extension://${EXTENSION_ID}/extra`,
    `moz-extension://${EXTENSION_ID}`,
  ])('rejects %s', (origin) => {
    expect(createOriginPolicy()(origin)).toBe(false);
  });

  it('restricts to allowed extension IDs when configured', () => {
    const policy = createOriginPolicy({ allowedExtensionIds: [EXTENSION_ID] });
    expect(policy(`chrome-extension://${EXTENSION_ID}`)).toBe(true);
    expect(policy(`chrome-extension://${'p'.repeat(32)}`)).toBe(false);
  });
});

describe('isLoopbackAddress', () => {
  it('recognizes loopback addresses only', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('192.168.1.10')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});
