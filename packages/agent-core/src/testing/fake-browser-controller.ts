import type { BrowserController, ScrollDirection } from '@atlas/browser-core';

/** In-memory BrowserController for unit tests. Not exported from the package entry point. */
export class FakeBrowserController implements BrowserController {
  readonly calls: unknown[][] = [];
  launchError: Error | undefined;
  failOn: { method: string; error: Error } | undefined;
  title = 'Fake Page';
  url = 'about:blank';
  private running = false;
  private readonly disconnectListeners = new Set<() => void>();

  get isRunning(): boolean {
    return this.running;
  }

  launch(): Promise<void> {
    this.calls.push(['launch']);
    if (this.launchError) return Promise.reject(this.launchError);
    this.running = true;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.calls.push(['close']);
    this.running = false;
    return Promise.resolve();
  }

  goto(url: string): Promise<void> {
    return this.act('goto', url).then(() => {
      this.url = url;
    });
  }

  click(selector: string): Promise<void> {
    return this.act('click', selector);
  }

  type(selector: string, text: string): Promise<void> {
    return this.act('type', selector, text);
  }

  press(selector: string, key: string): Promise<void> {
    return this.act('press', selector, key);
  }

  scroll(direction: ScrollDirection, amount?: number): Promise<void> {
    return this.act('scroll', direction, amount);
  }

  getPageTitle(): Promise<string> {
    return Promise.resolve(this.title);
  }

  getCurrentUrl(): Promise<string> {
    return Promise.resolve(this.url);
  }

  getPageText(): Promise<string> {
    return Promise.resolve('');
  }

  onDisconnected(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }

  simulateUserClosedBrowser(): void {
    this.running = false;
    for (const listener of this.disconnectListeners) listener();
  }

  private act(method: string, ...args: unknown[]): Promise<void> {
    this.calls.push([method, ...args]);
    if (this.failOn?.method === method) return Promise.reject(this.failOn.error);
    return Promise.resolve();
  }
}
