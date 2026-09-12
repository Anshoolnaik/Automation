import type { PlannedStep } from '../types.js';
import type { SiteSearchHandler } from './site-search-handler.js';

/** Phase-1 demo handler. Uses only generic navigate/fill/press actions. */

const PORTAL_HOSTS = new Set(['wikipedia.org', 'www.wikipedia.org']);
const LANGUAGE_HOST = /^([a-z]{2,3}(?:-[a-z]+)?)(?:\.m)?\.wikipedia\.org$/i;

/** The www.wikipedia.org portal has a single, always-visible search box. */
const PORTAL_SEARCH_INPUT = '#searchInput';
/** Special:Search's main form; the page header has a second, sometimes collapsed, search box. */
const SPECIAL_SEARCH_INPUT = '#search input[name="search"]';

export const wikipediaSearchHandler: SiteSearchHandler = {
  siteName: 'Wikipedia',

  matches: (url) => PORTAL_HOSTS.has(url.hostname) || LANGUAGE_HOST.test(url.hostname),

  planSearch: (url, query) => {
    const language = LANGUAGE_HOST.exec(url.hostname)?.[1]?.toLowerCase();
    const [pageUrl, input, label] =
      language === undefined
        ? ['https://www.wikipedia.org/', PORTAL_SEARCH_INPUT, 'wikipedia.org']
        : [
            `https://${language}.wikipedia.org/wiki/Special:Search`,
            SPECIAL_SEARCH_INPUT,
            `${language}.wikipedia.org`,
          ];

    const steps: PlannedStep[] = [
      { description: `Opening ${label}`, action: { type: 'navigate', url: pageUrl } },
      {
        description: `Searching for ${query}`,
        action: { type: 'fill', selector: input, value: query },
      },
      {
        description: 'Submitting search',
        action: { type: 'press', selector: input, key: 'Enter' },
      },
    ];
    return steps;
  },
};
