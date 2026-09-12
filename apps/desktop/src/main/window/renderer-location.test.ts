import { describe, expect, it } from 'vitest';

import { createTrustedUrlCheck, resolveRendererLocation } from './renderer-location.js';

describe('resolveRendererLocation', () => {
  it('uses the dev server only when not packaged', () => {
    expect(
      resolveRendererLocation({
        isPackaged: false,
        devServerUrl: 'http://localhost:5173',
        mainDir: '/app/out/main',
      }),
    ).toEqual({ kind: 'dev-server', url: 'http://localhost:5173' });

    expect(
      resolveRendererLocation({
        isPackaged: true,
        devServerUrl: 'http://localhost:5173',
        mainDir: '/app/out/main',
      }).kind,
    ).toBe('file');
  });
});

describe('createTrustedUrlCheck', () => {
  it('accepts only the dev server origin', () => {
    const isTrusted = createTrustedUrlCheck({ kind: 'dev-server', url: 'http://localhost:5173/' });
    expect(isTrusted('http://localhost:5173/index.html')).toBe(true);
    expect(isTrusted('http://localhost:5174/')).toBe(false);
    expect(isTrusted('https://evil.example/')).toBe(false);
    expect(isTrusted(undefined)).toBe(false);
    expect(isTrusted('not a url')).toBe(false);
  });

  it('accepts only the packaged renderer file (POSIX)', () => {
    const isTrusted = createTrustedUrlCheck(
      { kind: 'file', filePath: '/Applications/Atlas.app/out/renderer/index.html' },
      'linux',
    );
    expect(isTrusted('file:///Applications/Atlas.app/out/renderer/index.html')).toBe(true);
    expect(isTrusted('file:///Applications/Atlas.app/out/renderer/index.html#/logs')).toBe(true);
    expect(isTrusted('file:///Applications/Atlas.app/out/renderer/other.html')).toBe(false);
    expect(isTrusted('file:///etc/passwd')).toBe(false);
    expect(isTrusted('http://localhost/out/renderer/index.html')).toBe(false);
  });

  it('compares Windows file paths case-insensitively', () => {
    const isTrusted = createTrustedUrlCheck(
      { kind: 'file', filePath: 'C:\\Program Files\\Atlas\\out\\renderer\\index.html' },
      'win32',
    );
    expect(isTrusted('file:///c:/Program%20Files/Atlas/out/renderer/index.html')).toBe(true);
    expect(isTrusted('file:///C:/Program%20Files/Atlas/out/renderer/evil.html')).toBe(false);
  });
});
