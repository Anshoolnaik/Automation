/** For each state, the states it may move to. States absent from a list are forbidden targets. */
export type TransitionTable<S extends string> = Readonly<Record<S, readonly S[]>>;

export type StateChangeListener<S extends string> = (to: S, from: S) => void;

export class InvalidStateTransitionError extends Error {
  override readonly name = 'InvalidStateTransitionError';
  readonly code = 'INVALID_STATE_TRANSITION';

  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid ${machine} state transition: ${from} -> ${to}`);
  }
}

/** A small explicit finite state machine. Replaces ad-hoc boolean flags. */
export class StateMachine<S extends string> {
  private current: S;
  private readonly listeners = new Set<StateChangeListener<S>>();

  constructor(
    readonly name: string,
    initial: S,
    private readonly transitions: TransitionTable<S>,
  ) {
    this.current = initial;
  }

  get state(): S {
    return this.current;
  }

  is(...states: S[]): boolean {
    return states.includes(this.current);
  }

  canTransition(to: S): boolean {
    return this.transitions[this.current].includes(to);
  }

  /** Moves to `to` or throws {@link InvalidStateTransitionError}. */
  transition(to: S): void {
    if (!this.canTransition(to)) {
      throw new InvalidStateTransitionError(this.name, this.current, to);
    }
    const from = this.current;
    this.current = to;
    for (const listener of this.listeners) listener(to, from);
  }

  onChange(listener: StateChangeListener<S>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/** A state is terminal when no transitions leave it. */
export function isTerminal<S extends string>(table: TransitionTable<S>, state: S): boolean {
  return table[state].length === 0;
}
