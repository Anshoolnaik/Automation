import type { TabMetadata } from '@atlas/agent-protocol';

import { toTabMetadata } from './tab-metadata.js';

export async function getActiveTabMetadata(): Promise<TabMetadata | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ? toTabMetadata(tab) : null;
}

export type PageChangeReason = 'activated' | 'updated';

/**
 * Reports when the page the user is looking at changes. Registered at service
 * worker start-up, as Manifest V3 requires listeners to be added synchronously.
 */
export function watchActivePage(
  onChange: (tab: TabMetadata, reason: PageChangeReason) => void,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const report = (reason: PageChangeReason) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      getActiveTabMetadata()
        .then((tab) => {
          if (tab) onChange(tab, reason);
        })
        .catch(() => undefined);
    }, 250);
  };

  chrome.tabs.onActivated.addListener(() => report('activated'));
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.status === 'complete' || changeInfo.title !== undefined)) {
      report('updated');
    }
  });
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) report('activated');
  });
}
