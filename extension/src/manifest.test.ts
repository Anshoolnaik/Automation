import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { ATLAS_EXTENSION_ID } from '@atlas/agent-protocol';
import { describe, expect, it } from 'vitest';

interface Manifest {
  manifest_version: number;
  key: string;
  permissions: string[];
  host_permissions?: string[];
  content_scripts?: unknown[];
  background: { service_worker: string; type: string };
}

const manifest = JSON.parse(
  readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'),
) as Manifest;

/** Chrome derives an extension ID from the SHA-256 of its public key, mapped onto a-p. */
function extensionIdFromKey(base64Key: string): string {
  const digest = createHash('sha256').update(Buffer.from(base64Key, 'base64')).digest('hex');
  return [...digest.slice(0, 32)]
    .map((char) => String.fromCharCode(97 + parseInt(char, 16)))
    .join('');
}

describe('extension manifest', () => {
  it('is Manifest V3 with a module service worker', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: 'service-worker.js', type: 'module' });
  });

  it('pins the extension ID the desktop agent allows by default', () => {
    expect(extensionIdFromKey(manifest.key)).toBe(ATLAS_EXTENSION_ID);
  });

  it('requests only the minimum permissions and never content access', () => {
    expect([...manifest.permissions].sort()).toEqual(['alarms', 'tabs']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });
});
