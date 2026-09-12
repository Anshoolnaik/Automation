/** The desktop agent only ever binds to the IPv4 loopback interface. */
export const AGENT_HOST = '127.0.0.1';

/** Default WebSocket port. Override with ATLAS_AGENT_PORT (desktop and extension build). */
export const DEFAULT_AGENT_PORT = 47821;

export const PROTOCOL_VERSION = 1;

/**
 * ID of the Atlas Chrome extension. It is fixed by the public "key" in
 * extension/public/manifest.json, so the unpacked extension has the same ID on every
 * machine and the desktop agent can accept connections from it alone.
 */
export const ATLAS_EXTENSION_ID = 'hhkcbmdmobniaagpjgcfnihickadngij';
