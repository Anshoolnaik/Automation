/**
 * Redaction helpers. Logs must never contain passwords, cookies, tokens or
 * other session secrets, so every entry passes through these before being
 * written anywhere.
 */

export const REDACTED = '[REDACTED]';

const MAX_STRING_LENGTH = 2_000;
const MAX_DEPTH = 6;

const SENSITIVE_KEY_PATTERN =
  /pass(word|wd|phrase)|secret|token|cookie|credential|authorization|api[-_]?key|private[-_]?key|session|^(auth|pin|otp|sid|jwt|code|signature|sig)$/i;

const SENSITIVE_QUERY_PARAM_PATTERN =
  /^(.*token.*|.*secret.*|.*password.*|.*session.*|auth|code|key|api[-_]?key|sig|signature|jwt|credential|otp)$/i;

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\[[0-9;]*[A-Za-z]/g;
const JWT_PATTERN = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}\b/g;
const BEARER_PATTERN = /\b(Bearer|Basic)\s+[\w\-.~+/=]+/gi;
const COOKIE_HEADER_PATTERN = /\b(set-cookie|cookie)\s*:\s*[^\n]*/gi;
const URL_USERINFO_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi;
const QUERY_PARAM_PATTERN = /([?&#;])([^=&#\s]+)=([^&#\s]*)/g;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/** Removes secrets that commonly appear inside free text (URLs, headers, tokens). */
export function redactText(text: string): string {
  const redacted = text
    .replace(ANSI_PATTERN, '')
    .replace(URL_USERINFO_PATTERN, `$1${REDACTED}@`)
    .replace(COOKIE_HEADER_PATTERN, `$1: ${REDACTED}`)
    .replace(BEARER_PATTERN, `$1 ${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(QUERY_PARAM_PATTERN, (match, separator: string, name: string) =>
      SENSITIVE_QUERY_PARAM_PATTERN.test(name) ? `${separator}${name}=${REDACTED}` : match,
    );
  return truncate(redacted, MAX_STRING_LENGTH);
}

/** Deeply sanitizes an arbitrary value so it is safe to serialize into logs. */
export function redactValue(value: unknown): unknown {
  return redactInner(value, 0, new WeakSet());
}

export function redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const result = redactValue(metadata);
  return isPlainRecord(result) ? result : {};
}

/** Produces a single-line, redacted, length-limited description of an error. */
export function sanitizeErrorMessage(error: unknown, maxLength = 1_000): string {
  if (error === undefined || error === null) return 'Unknown error';
  const raw =
    error instanceof Error
      ? error.message || error.name
      : typeof error === 'string'
        ? error
        : safeStringify(error);
  const firstMeaningfulPart = raw.replace(ANSI_PATTERN, '').split(/\n\s*=+\s*logs\s*=+/i)[0] ?? '';
  const singleLine = firstMeaningfulPart.replace(/\s+/g, ' ').trim();
  return truncate(redactText(singleLine || 'Unknown error'), maxLength);
}

function redactInner(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: sanitizeErrorMessage(value) };
  }
  if (typeof value !== 'object') return undefined;
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactInner(item, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redactInner(child, depth + 1, seen);
  }
  return output;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…[truncated]`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
