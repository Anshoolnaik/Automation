import type { Session } from 'electron';

/**
 * The Atlas UI needs no web permissions (camera, notifications, geolocation…).
 * Deny them all for the Electron session. This does not affect the Agent Browser,
 * which is a separate Google Chrome process.
 */
export function hardenSession(session: Session): void {
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
}
