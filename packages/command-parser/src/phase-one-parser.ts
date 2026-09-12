import { isBrowserError, normalizeNavigableUrl } from '@atlas/browser-core';

import { matchIntent } from './grammar.js';
import type { SiteSearchHandler } from './site-handlers/site-search-handler.js';
import { wikipediaSearchHandler } from './site-handlers/wikipedia.js';
import type { CommandParser, ParseResult } from './types.js';

export const SUPPORTED_COMMAND_EXAMPLES = [
  'Open wikipedia.org',
  'Open wikipedia.org and search for Alan Turing',
] as const;

const UNSUPPORTED_MESSAGE =
  `Atlas (Phase 1) only understands a few simple commands, for example: ` +
  SUPPORTED_COMMAND_EXAMPLES.map((example) => `"${example}"`).join(' or ');

/**
 * PHASE-1 DETERMINISTIC COMMAND HANDLING.
 *
 * This is intentionally NOT a general-purpose planner and contains no AI. It
 * recognizes "open <site>" and "open <site> and search for <query>" so the
 * browser automation stack can be exercised end to end.
 */
export function createPhaseOneCommandParser(
  searchHandlers: readonly SiteSearchHandler[] = [wikipediaSearchHandler],
): CommandParser {
  return {
    parse(command: string): ParseResult {
      const intent = matchIntent(command);
      if (!intent) return { ok: false, error: UNSUPPORTED_MESSAGE };

      let url: URL;
      try {
        url = normalizeNavigableUrl(intent.target);
      } catch (error) {
        return {
          ok: false,
          error: isBrowserError(error)
            ? error.message
            : `"${intent.target}" is not a website address`,
        };
      }

      if (intent.kind === 'open') {
        return {
          ok: true,
          plan: {
            summary: `Open ${url.hostname}`,
            steps: [
              {
                description: `Opening ${displayTarget(url)}`,
                action: { type: 'navigate', url: url.href },
              },
            ],
          },
        };
      }

      const handler = searchHandlers.find((candidate) => candidate.matches(url));
      if (!handler) {
        const supported = searchHandlers.map((candidate) => candidate.siteName).join(', ');
        return {
          ok: false,
          error: `Searching ${url.hostname} is not supported in Phase 1. Supported sites: ${supported}.`,
        };
      }
      return {
        ok: true,
        plan: {
          summary: `Search ${handler.siteName} for "${intent.query}"`,
          steps: handler.planSearch(url, intent.query),
        },
      };
    },
  };
}

function displayTarget(url: URL): string {
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.host}${path}`;
}
