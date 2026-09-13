/** For each status, the statuses it may move to. Anything absent is forbidden. */
export type TransitionTable<S extends string> = Readonly<Record<S, readonly S[]>>;

export function canTransition<S extends string>(
  table: TransitionTable<S>,
  from: S,
  to: S,
): boolean {
  return table[from].includes(to);
}

/** Every status from which `to` is reachable. Used to guard database updates atomically. */
export function sourcesOf<S extends string>(table: TransitionTable<S>, to: S): S[] {
  return (Object.keys(table) as S[]).filter((from) => table[from].includes(to));
}

export function isTerminalStatus<S extends string>(table: TransitionTable<S>, status: S): boolean {
  return table[status].length === 0;
}
