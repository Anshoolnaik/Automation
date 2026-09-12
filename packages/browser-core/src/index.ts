// Engine-agnostic surface. The Playwright implementation lives at `@atlas/browser-core/playwright`.
export {
  DEFAULT_BROWSER_TIMEOUTS,
  type BrowserController,
  type BrowserTimeouts,
  type ScrollDirection,
} from './browser-controller.js';
export { describeAction, type BrowserAction, type BrowserActionType } from './actions.js';
export { executeBrowserAction } from './action-executor.js';
export { BrowserError, isBrowserError, type BrowserErrorCode } from './errors.js';
export { normalizeNavigableUrl } from './url.js';
