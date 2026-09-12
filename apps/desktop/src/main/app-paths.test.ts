import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveAppPaths } from './app-paths.js';

describe('resolveAppPaths', () => {
  it('builds Windows paths under userData', () => {
    const paths = resolveAppPaths('C:\\Users\\someone\\AppData\\Roaming\\Atlas Agent', path.win32);
    expect(paths).toEqual({
      userDataDir: 'C:\\Users\\someone\\AppData\\Roaming\\Atlas Agent',
      browserProfileDir: 'C:\\Users\\someone\\AppData\\Roaming\\Atlas Agent\\browser-profile',
      dataDir: 'C:\\Users\\someone\\AppData\\Roaming\\Atlas Agent\\data',
      databaseFile: 'C:\\Users\\someone\\AppData\\Roaming\\Atlas Agent\\data\\atlas.db',
      logsDir: 'C:\\Users\\someone\\AppData\\Roaming\\Atlas Agent\\logs',
    });
  });

  it('builds macOS paths under userData', () => {
    const paths = resolveAppPaths(
      '/Users/someone/Library/Application Support/Atlas Agent',
      path.posix,
    );
    expect(paths.browserProfileDir).toBe(
      '/Users/someone/Library/Application Support/Atlas Agent/browser-profile',
    );
    expect(paths.databaseFile).toBe(
      '/Users/someone/Library/Application Support/Atlas Agent/data/atlas.db',
    );
    expect(paths.logsDir).toBe('/Users/someone/Library/Application Support/Atlas Agent/logs');
  });

  it('normalizes redundant separators', () => {
    expect(resolveAppPaths('/tmp//atlas/', path.posix).browserProfileDir).toBe(
      '/tmp/atlas/browser-profile',
    );
  });

  it('rejects relative or empty userData paths', () => {
    expect(() => resolveAppPaths('relative/dir', path.posix)).toThrow(/absolute/);
    expect(() => resolveAppPaths('', path.win32)).toThrow(/absolute/);
  });

  it('never points at a default Chrome profile location', () => {
    const paths = resolveAppPaths('/home/u/.config/Atlas Agent', path.posix);
    expect(paths.browserProfileDir).not.toMatch(/google-chrome|Google[/\\]Chrome/i);
  });
});
