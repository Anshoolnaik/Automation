/**
 * PHASE-1 DETERMINISTIC GRAMMAR. Deliberately tiny: it exists only to exercise
 * the browser infrastructure and will be replaced by a real planner.
 *
 *   <verb> <site>
 *   <verb> <site> and search [for] <query>
 *
 *   verb := open | go to | navigate to | visit
 */

export type CommandIntent =
  { kind: 'open'; target: string } | { kind: 'open-and-search'; target: string; query: string };

export const MAX_QUERY_LENGTH = 200;

const VERB = String.raw`(?:open|go\s+to|navigate\s+to|visit)`;
const OPEN_AND_SEARCH = new RegExp(
  String.raw`^${VERB}\s+(\S+)\s+and\s+search(?:\s+for)?\s+(.+)$`,
  'i',
);
const OPEN = new RegExp(String.raw`^${VERB}\s+(\S+)$`, 'i');

export function matchIntent(command: string): CommandIntent | undefined {
  const normalized = command
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '');

  const search = OPEN_AND_SEARCH.exec(normalized);
  if (search?.[1] && search[2]) {
    const query = cleanQuery(search[2]);
    return query ? { kind: 'open-and-search', target: search[1], query } : undefined;
  }

  const open = OPEN.exec(normalized);
  if (open?.[1]) return { kind: 'open', target: open[1] };

  return undefined;
}

function cleanQuery(raw: string): string {
  const unquoted = raw.trim().replace(/^["'“‘](.*)["'”’]$/u, '$1');
  return unquoted.trim().slice(0, MAX_QUERY_LENGTH);
}
