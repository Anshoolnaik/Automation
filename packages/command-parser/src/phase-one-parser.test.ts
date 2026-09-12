import { describe, expect, it } from 'vitest';

import { matchIntent } from './grammar.js';
import { createPhaseOneCommandParser } from './phase-one-parser.js';
import type { ParseResult } from './types.js';

const parser = createPhaseOneCommandParser();

function planOf(result: ParseResult) {
  if (!result.ok) throw new Error(`expected a plan, got error: ${result.error}`);
  return result.plan;
}

describe('Phase-1 command parser', () => {
  it('parses "Open wikipedia.org" into a single navigation', () => {
    expect(planOf(parser.parse('Open wikipedia.org'))).toEqual({
      summary: 'Open wikipedia.org',
      steps: [
        {
          description: 'Opening wikipedia.org',
          action: { type: 'navigate', url: 'https://wikipedia.org/' },
        },
      ],
    });
  });

  it('parses the Wikipedia search demo into navigate, fill and press actions', () => {
    expect(planOf(parser.parse('Open wikipedia.org and search for Alan Turing'))).toEqual({
      summary: 'Search Wikipedia for "Alan Turing"',
      steps: [
        {
          description: 'Opening wikipedia.org',
          action: { type: 'navigate', url: 'https://www.wikipedia.org/' },
        },
        {
          description: 'Searching for Alan Turing',
          action: { type: 'fill', selector: '#searchInput', value: 'Alan Turing' },
        },
        {
          description: 'Submitting search',
          action: { type: 'press', selector: '#searchInput', key: 'Enter' },
        },
      ],
    });
  });

  it('uses Special:Search for language-specific Wikipedia hosts', () => {
    const plan = planOf(parser.parse('open en.wikipedia.org and search for Ada Lovelace'));
    expect(plan.steps.map((step) => step.action)).toEqual([
      { type: 'navigate', url: 'https://en.wikipedia.org/wiki/Special:Search' },
      { type: 'fill', selector: '#search input[name="search"]', value: 'Ada Lovelace' },
      { type: 'press', selector: '#search input[name="search"]', key: 'Enter' },
    ]);
    expect(plan.steps[0]?.description).toBe('Opening en.wikipedia.org');
  });

  it.each([
    [
      'go to https://en.wikipedia.org/wiki/Alan_Turing',
      'https://en.wikipedia.org/wiki/Alan_Turing',
    ],
    ['  Visit   example.com.  ', 'https://example.com/'],
    ['NAVIGATE TO localhost:5173', 'https://localhost:5173/'],
  ])('accepts verb variations: %s', (command, url) => {
    expect(planOf(parser.parse(command)).steps[0]?.action).toEqual({ type: 'navigate', url });
  });

  it.each([
    ['search without "for"', 'Open wikipedia.org and search Alan Turing', 'Alan Turing'],
    ['quoted query', 'Open www.wikipedia.org and search for "Alan Turing"', 'Alan Turing'],
    ['extra whitespace', 'open  wikipedia.org  and  search  for  Alan   Turing', 'Alan Turing'],
  ])('normalizes queries: %s', (_label, command, query) => {
    const fill = planOf(parser.parse(command)).steps[1]?.action;
    expect(fill).toMatchObject({ type: 'fill', value: query });
  });

  it.each([
    '',
    'Tell me about Alan Turing',
    'Open',
    'Open wikipedia.org please',
    'Delete all my emails',
  ])('rejects unsupported command %j with guidance', (command) => {
    const result = parser.parse(command);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain('Open wikipedia.org and search for Alan Turing');
  });

  it('rejects searching sites without a handler', () => {
    expect(parser.parse('Open example.com and search for cats')).toEqual({
      ok: false,
      error: 'Searching example.com is not supported in Phase 1. Supported sites: Wikipedia.',
    });
  });

  it('rejects non-web targets', () => {
    const result = parser.parse('Open file:///etc/passwd');
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/Only http and https/);
    expect(parser.parse('Open javascript:alert(1)').ok).toBe(false);
  });

  it('never lets a hostile host impersonate Wikipedia', () => {
    expect(parser.parse('Open wikipedia.org.evil.com and search for x').ok).toBe(false);
    expect(parser.parse('Open evilwikipedia.org and search for x').ok).toBe(false);
  });
});

describe('matchIntent', () => {
  it('limits query length', () => {
    const intent = matchIntent(`Open wikipedia.org and search for ${'x'.repeat(500)}`);
    expect(intent).toMatchObject({ kind: 'open-and-search' });
    expect(intent?.kind === 'open-and-search' && intent.query.length).toBe(200);
  });
});
