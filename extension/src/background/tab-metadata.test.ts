import { TabMetadataSchema } from '@atlas/agent-protocol';
import { describe, expect, it } from 'vitest';

import { describeConnection } from '../popup/popup-view.js';
import { toTabMetadata } from './tab-metadata.js';

describe('toTabMetadata', () => {
  it('maps a regular tab', () => {
    expect(
      toTabMetadata({
        id: 3,
        windowId: 1,
        url: 'https://www.wikipedia.org/',
        title: 'Wikipedia',
        status: 'complete',
        incognito: false,
        favIconUrl: 'https://www.wikipedia.org/static/favicon/wikipedia.ico',
      }),
    ).toEqual({
      tabId: 3,
      windowId: 1,
      url: 'https://www.wikipedia.org/',
      title: 'Wikipedia',
      status: 'complete',
      incognito: false,
      favIconUrl: 'https://www.wikipedia.org/static/favicon/wikipedia.ico',
    });
  });

  it('returns null for tabs without an id', () => {
    expect(toTabMetadata({ windowId: 1, incognito: false })).toBeNull();
  });

  it('always produces protocol-valid metadata, even for extreme tabs', () => {
    const metadata = toTabMetadata({
      id: 1,
      windowId: 2,
      pendingUrl: `https://example.com/${'a'.repeat(10_000)}`,
      title: 't'.repeat(5_000),
      status: 'unloaded',
      incognito: true,
      favIconUrl: `data:image/png;base64,${'A'.repeat(50_000)}`,
    });
    expect(TabMetadataSchema.safeParse(metadata).success).toBe(true);
    expect(metadata).toMatchObject({ status: 'unknown' });
    expect(metadata?.favIconUrl).toBeUndefined();
  });
});

describe('describeConnection', () => {
  it('labels every connection status', () => {
    expect(describeConnection('connected').label).toBe('Connected');
    expect(describeConnection('disconnected').label).toBe('Disconnected');
    expect(describeConnection('connecting').label).toBe('Connecting…');
  });
});
