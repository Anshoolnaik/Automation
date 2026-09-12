import type { LogMetadata, Logger } from '@atlas/logger';
import { chromium, type BrowserContext, type Page } from 'playwright-core';

import {
  DEFAULT_BROWSER_TIMEOUTS,
  type BrowserController,
  type BrowserTimeouts,
  type ScrollDirection,
} from '../browser-controller.js';
import { BrowserError } from '../errors.js';
import { normalizeNavigableUrl } from '../url.js';
import { isTimeoutError, mapLaunchError, mapOperationError } from './error-mapping.js';
import { buildPersistentLaunchOptions } from './launch-options.js';

export interface PlaywrightBrowserControllerOptions {
  /** Dedicated persistent profile directory. Created by Chrome if missing; never deleted. */
  profileDir: string;
  logger: Logger;
  executablePath?: string | undefined;
  headless?: boolean;
  timeouts?: Partial<BrowserTimeouts>;
  extraArgs?: readonly string[];
}

const DEFAULT_SCROLL_AMOUNT = 600;
const MAX_SCROLL_AMOUNT = 20_000;
const MAX_PAGE_TEXT_LENGTH = 200_000;
/** After a key press, how long to wait for a navigation to begin before assuming none will. */
const NAVIGATION_START_GRACE_MS = 2_500;

export class PlaywrightBrowserController implements BrowserController {
  private readonly logger: Logger;
  private readonly timeouts: BrowserTimeouts;
  private context: BrowserContext | undefined;
  private launching: Promise<void> | undefined;
  private closingContext: BrowserContext | undefined;
  /** The tab Atlas last worked in; preferred over other tabs while it stays open. */
  private workingPage: Page | undefined;
  private readonly disconnectListeners = new Set<() => void>();

  constructor(private readonly options: PlaywrightBrowserControllerOptions) {
    this.logger = options.logger;
    this.timeouts = { ...DEFAULT_BROWSER_TIMEOUTS, ...options.timeouts };
  }

  get isRunning(): boolean {
    return this.context !== undefined;
  }

  launch(): Promise<void> {
    if (this.context) return Promise.resolve();
    this.launching ??= this.startBrowser().finally(() => {
      this.launching = undefined;
    });
    return this.launching;
  }

  async close(): Promise<void> {
    if (this.launching) await this.launching.catch(() => undefined);
    const context = this.context;
    if (!context) return;
    const startedAt = Date.now();
    this.logger.info('Closing Chrome');
    this.closingContext = context;
    try {
      await context.close();
    } finally {
      this.closingContext = undefined;
      this.detach(context);
    }
    this.logger.info('Chrome closed', { metadata: { durationMs: Date.now() - startedAt } });
  }

  async goto(url: string): Promise<void> {
    const target = normalizeNavigableUrl(url);
    await this.operation('goto', { url: target.href }, async (page) => {
      const response = await page.goto(target.href, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeouts.navigationMs,
      });
      await page.bringToFront();
      const status = response?.status();
      if (status !== undefined && status >= 400) {
        this.logger.warn('Page responded with an HTTP error status', {
          metadata: { url: page.url(), status },
        });
      }
      return { finalUrl: page.url(), status };
    });
  }

  async click(selector: string): Promise<void> {
    requireNonEmpty(selector, 'selector', 'click');
    await this.operation('click', { selector }, async (page) => {
      const urlBefore = page.url();
      await page.locator(selector).click({ timeout: this.timeouts.actionMs });
      await this.settleAfterInput(page, urlBefore);
    });
  }

  async type(selector: string, text: string): Promise<void> {
    requireNonEmpty(selector, 'selector', 'type');
    // Only the length is logged: typed text may be sensitive.
    await this.operation('type', { selector, textLength: text.length }, async (page) => {
      await page.locator(selector).fill(text, { timeout: this.timeouts.actionMs });
    });
  }

  async press(selector: string, key: string): Promise<void> {
    requireNonEmpty(selector, 'selector', 'press');
    requireNonEmpty(key, 'key', 'press');
    await this.operation('press', { selector, key }, async (page) => {
      const urlBefore = page.url();
      await page.locator(selector).press(key, { timeout: this.timeouts.actionMs });
      await this.settleAfterInput(page, urlBefore);
      return { finalUrl: page.url() };
    });
  }

  async scroll(direction: ScrollDirection, amount = DEFAULT_SCROLL_AMOUNT): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_SCROLL_AMOUNT) {
      throw new BrowserError(
        'INVALID_ARGUMENT',
        `Scroll amount must be between 1 and ${MAX_SCROLL_AMOUNT} pixels`,
        'scroll',
      );
    }
    await this.operation('scroll', { direction, amount }, async (page) => {
      await page.mouse.wheel(0, direction === 'down' ? amount : -amount);
    });
  }

  getPageTitle(): Promise<string> {
    return this.operation(
      'getPageTitle',
      {},
      (page) => page.title(),
      (title) => ({
        titleLength: title.length,
      }),
    );
  }

  getCurrentUrl(): Promise<string> {
    return this.operation('getCurrentUrl', {}, (page) => Promise.resolve(page.url()));
  }

  getPageText(): Promise<string> {
    return this.operation(
      'getPageText',
      {},
      async (page) => {
        const text = await page.locator('body').innerText({ timeout: this.timeouts.actionMs });
        return text.length > MAX_PAGE_TEXT_LENGTH ? text.slice(0, MAX_PAGE_TEXT_LENGTH) : text;
      },
      (text) => ({ textLength: text.length }),
    );
  }

  onDisconnected(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }

  private async startBrowser(): Promise<void> {
    const launchOptions = buildPersistentLaunchOptions({
      executablePath: this.options.executablePath,
      launchTimeoutMs: this.timeouts.launchMs,
      ...(this.options.headless !== undefined && { headless: this.options.headless }),
      ...(this.options.extraArgs && { extraArgs: this.options.extraArgs }),
    });
    const startedAt = Date.now();
    this.logger.info('Launching Chrome with the dedicated Atlas profile', {
      metadata: {
        profileDir: this.options.profileDir,
        channel: launchOptions.channel ?? 'custom-executable',
        headless: launchOptions.headless,
      },
    });

    let context: BrowserContext;
    try {
      context = await chromium.launchPersistentContext(this.options.profileDir, launchOptions);
    } catch (error) {
      const mapped = mapLaunchError(error);
      this.logger.error('Chrome failed to launch', {
        metadata: { code: mapped.code, error: mapped.message },
      });
      throw mapped;
    }

    context.setDefaultTimeout(this.timeouts.actionMs);
    context.setDefaultNavigationTimeout(this.timeouts.navigationMs);
    context.on('close', () => this.handleContextClosed(context));
    this.context = context;
    this.logger.info('Chrome launched', {
      metadata: {
        durationMs: Date.now() - startedAt,
        version: context.browser()?.version(),
        openTabs: context.pages().length,
      },
    });
  }

  private handleContextClosed(context: BrowserContext): void {
    if (this.context !== context) return;
    const expected = this.closingContext === context;
    this.detach(context);
    if (!expected) {
      this.logger.warn('Chrome was closed outside Atlas');
      for (const listener of this.disconnectListeners) listener();
    }
  }

  private detach(context: BrowserContext): void {
    if (this.context === context) {
      this.context = undefined;
      this.workingPage = undefined;
    }
  }

  private async activePage(operation: string): Promise<Page> {
    const context = this.context;
    if (!context) {
      throw new BrowserError(
        'BROWSER_NOT_RUNNING',
        'The Agent Browser is not running. Launch it first.',
        operation,
      );
    }
    if (this.workingPage && !this.workingPage.isClosed()) return this.workingPage;
    const openPages = context.pages().filter((page) => !page.isClosed());
    this.workingPage = openPages.at(-1) ?? (await context.newPage());
    return this.workingPage;
  }

  /** Runs one browser operation with uniform structured logging and error mapping. */
  private async operation<T>(
    name: string,
    metadata: LogMetadata,
    run: (page: Page) => Promise<T>,
    summarize?: (result: T) => LogMetadata,
  ): Promise<T> {
    const startedAt = Date.now();
    this.logger.debug(`${name} started`, { metadata });
    try {
      const page = await this.activePage(name);
      const result = await run(page);
      const resultMetadata =
        summarize?.(result) ??
        (typeof result === 'object' && result !== null ? (result as LogMetadata) : {});
      this.logger.debug(`${name} completed`, {
        metadata: { ...metadata, ...resultMetadata, durationMs: Date.now() - startedAt },
      });
      return result;
    } catch (error) {
      const mapped = mapOperationError(error, name);
      this.logger.warn(`${name} failed`, {
        metadata: {
          ...metadata,
          code: mapped.code,
          error: mapped.message,
          durationMs: Date.now() - startedAt,
        },
      });
      throw mapped;
    }
  }

  /**
   * Input such as Enter or a click may or may not trigger navigation. Wait briefly
   * for one to start; if it does, wait for the new document to be ready.
   */
  private async settleAfterInput(page: Page, urlBefore: string): Promise<void> {
    try {
      await page.waitForURL((url) => url.href !== urlBefore, {
        timeout: NAVIGATION_START_GRACE_MS,
        waitUntil: 'commit',
      });
    } catch (error) {
      if (isTimeoutError(error)) return; // No navigation happened: expected for many inputs.
      throw error;
    }
    await page.waitForLoadState('domcontentloaded', { timeout: this.timeouts.navigationMs });
  }
}

function requireNonEmpty(value: string, name: string, operation: string): void {
  if (!value.trim()) {
    throw new BrowserError('INVALID_ARGUMENT', `${name} must not be empty`, operation);
  }
}
