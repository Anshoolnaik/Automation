const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/([a-p]{32})$/;
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export interface OriginPolicyOptions {
  /** When non-empty, only these Chrome extension IDs may connect. */
  allowedExtensionIds?: readonly string[];
}

/**
 * Only Chrome extensions may connect. Web pages cannot forge the Origin header,
 * so this stops any website from talking to the local agent (cross-site WebSocket hijacking).
 */
export function createOriginPolicy(
  options: OriginPolicyOptions = {},
): (origin: string | undefined) => boolean {
  const allowed = new Set(options.allowedExtensionIds ?? []);
  return (origin) => {
    if (!origin) return false;
    const match = EXTENSION_ORIGIN_PATTERN.exec(origin);
    if (!match) return false;
    return allowed.size === 0 || allowed.has(match[1] ?? '');
  };
}

export function isLoopbackAddress(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK_ADDRESSES.has(address);
}
