import type { ScrollDirection } from './browser-controller.js';

/**
 * Atomic, serializable browser instructions. Planners (the Phase-1 parser today,
 * something smarter later) produce these; the generic executor runs them.
 */
export type BrowserAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'press'; selector: string; key: string }
  | { type: 'scroll'; direction: ScrollDirection; amount?: number };

export type BrowserActionType = BrowserAction['type'];

/** Short human-readable description used in activity logs. */
export function describeAction(action: BrowserAction): string {
  switch (action.type) {
    case 'navigate':
      return `Navigate to ${action.url}`;
    case 'click':
      return `Click ${action.selector}`;
    case 'fill':
      return `Type into ${action.selector}`;
    case 'press':
      return `Press ${action.key} in ${action.selector}`;
    case 'scroll':
      return `Scroll ${action.direction}${action.amount ? ` by ${action.amount}px` : ''}`;
  }
}
