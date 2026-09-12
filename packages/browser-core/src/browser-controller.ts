export type ScrollDirection = 'up' | 'down';

/**
 * Engine-agnostic browser control. Nothing outside the Playwright
 * implementation should know Playwright exists.
 */
export interface BrowserController {
  readonly isRunning: boolean;

  launch(): Promise<void>;
  close(): Promise<void>;

  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  /** Replaces the value of an editable element. */
  type(selector: string, text: string): Promise<void>;
  press(selector: string, key: string): Promise<void>;
  scroll(direction: ScrollDirection, amount?: number): Promise<void>;

  getPageTitle(): Promise<string>;
  getCurrentUrl(): Promise<string>;
  getPageText(): Promise<string>;

  /** Fires when the browser goes away without `close()` being called (e.g. the user closed Chrome). */
  onDisconnected(listener: () => void): () => void;
}

export interface BrowserTimeouts {
  launchMs: number;
  navigationMs: number;
  actionMs: number;
}

export const DEFAULT_BROWSER_TIMEOUTS: Readonly<BrowserTimeouts> = {
  launchMs: 60_000,
  navigationMs: 30_000,
  actionMs: 15_000,
};
