import { BrowserError } from './errors.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const HOST_LIKE_PATTERN =
  /^(localhost|\d{1,3}(\.\d{1,3}){3}|([a-z0-9-]+\.)+[a-z]{2,})(:\d+)?([/?#].*)?$/i;

/**
 * Turns user input such as `wikipedia.org` into an absolute http(s) URL.
 * Only http and https are navigable by the agent: no file:, javascript:, data: or chrome: URLs.
 */
export function normalizeNavigableUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw invalid(input, 'URL is empty');

  let candidate: string;
  if (/^https?:\/\//i.test(trimmed)) {
    candidate = trimmed;
  } else if (SCHEME_PATTERN.test(trimmed) && !/^[^:]+:\d+/.test(trimmed)) {
    throw invalid(input, 'Only http and https URLs can be opened');
  } else if (HOST_LIKE_PATTERN.test(trimmed)) {
    candidate = `https://${trimmed}`;
  } else {
    throw invalid(input, 'Not a valid web address');
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw invalid(input, 'Not a valid web address');
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw invalid(input, 'Only http and https URLs can be opened');
  }
  if (url.username || url.password) {
    throw invalid(input, 'URLs with embedded credentials are not allowed');
  }
  return url;
}

function invalid(input: string, reason: string): BrowserError {
  const shown = input.length > 100 ? `${input.slice(0, 100)}…` : input;
  return new BrowserError('INVALID_URL', `${reason}: "${shown}"`, 'goto');
}
