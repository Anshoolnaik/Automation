import { ATLAS_EXTENSION_ID, DEFAULT_AGENT_PORT } from '@atlas/agent-protocol';
import { describe, expect, it } from 'vitest';

import { ConfigError, loadAppConfig } from './config.js';

describe('loadAppConfig', () => {
  it('uses safe defaults', () => {
    expect(loadAppConfig({}, { isPackaged: true })).toEqual({
      agentPort: DEFAULT_AGENT_PORT,
      logLevel: 'info',
      allowedExtensionIds: [ATLAS_EXTENSION_ID],
      isDevelopment: false,
    });
    expect(loadAppConfig({}, { isPackaged: false }).logLevel).toBe('debug');
  });

  it('reads overrides from the environment', () => {
    const config = loadAppConfig(
      {
        ATLAS_AGENT_PORT: '50000',
        ATLAS_LOG_LEVEL: 'warn',
        ATLAS_CHROME_EXECUTABLE: '/opt/chrome/chrome',
      },
      { isPackaged: true },
    );
    expect(config).toMatchObject({
      agentPort: 50000,
      logLevel: 'warn',
      chromeExecutablePath: '/opt/chrome/chrome',
    });
  });

  it('ignores blank values', () => {
    expect(loadAppConfig({ ATLAS_AGENT_PORT: '  ' }, { isPackaged: true }).agentPort).toBe(
      DEFAULT_AGENT_PORT,
    );
  });

  it.each(['80', '70000', 'abc', '1.5'])('rejects invalid port %s', (port) => {
    expect(() => loadAppConfig({ ATLAS_AGENT_PORT: port }, { isPackaged: true })).toThrow(
      ConfigError,
    );
  });

  it('configures which extensions may connect', () => {
    const id = 'b'.repeat(32);
    const load = (value: string) =>
      loadAppConfig({ ATLAS_ALLOWED_EXTENSION_IDS: value }, { isPackaged: true })
        .allowedExtensionIds;
    expect(load(`${id}, ${ATLAS_EXTENSION_ID}`)).toEqual([id, ATLAS_EXTENSION_ID]);
    expect(load('*')).toEqual([]);
    expect(() => load('not-an-id')).toThrow(ConfigError);
  });

  it('rejects unknown log levels', () => {
    expect(() => loadAppConfig({ ATLAS_LOG_LEVEL: 'verbose' }, { isPackaged: true })).toThrow(
      ConfigError,
    );
  });
});
