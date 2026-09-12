import type { BrowserAction } from './actions.js';
import type { BrowserController } from './browser-controller.js';

/**
 * Executes one action against any BrowserController. Contains no site-specific
 * knowledge: every site-specific decision belongs to whoever produced the action.
 */
export async function executeBrowserAction(
  controller: BrowserController,
  action: BrowserAction,
): Promise<void> {
  switch (action.type) {
    case 'navigate':
      return controller.goto(action.url);
    case 'click':
      return controller.click(action.selector);
    case 'fill':
      return controller.type(action.selector, action.value);
    case 'press':
      return controller.press(action.selector, action.key);
    case 'scroll':
      return controller.scroll(action.direction, action.amount);
  }
}
