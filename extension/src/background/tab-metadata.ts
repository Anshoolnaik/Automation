import type { TabMetadata } from '@atlas/agent-protocol';

/** The fields of chrome.tabs.Tab that Atlas reads. */
export interface TabLike {
  id?: number | undefined;
  windowId: number;
  url?: string | undefined;
  pendingUrl?: string | undefined;
  title?: string | undefined;
  status?: string | undefined;
  incognito: boolean;
  favIconUrl?: string | undefined;
}

const MAX_URL_LENGTH = 4096;
const MAX_TITLE_LENGTH = 1024;
const MAX_FAVICON_URL_LENGTH = 2048;

/**
 * Basic, non-content metadata from the tabs API. No page content is read:
 * the extension does not scrape pages in Phase 1.
 */
export function toTabMetadata(tab: TabLike): TabMetadata | null {
  if (tab.id === undefined || tab.id < 0) return null;
  const metadata: TabMetadata = {
    tabId: tab.id,
    windowId: tab.windowId,
    url: (tab.url || tab.pendingUrl || '').slice(0, MAX_URL_LENGTH),
    title: (tab.title ?? '').slice(0, MAX_TITLE_LENGTH),
    status: tab.status === 'loading' || tab.status === 'complete' ? tab.status : 'unknown',
    incognito: tab.incognito,
  };
  const favicon = tab.favIconUrl;
  if (favicon && /^https?:\/\//.test(favicon) && favicon.length <= MAX_FAVICON_URL_LENGTH) {
    metadata.favIconUrl = favicon;
  }
  return metadata;
}
