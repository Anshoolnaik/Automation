export interface Migration {
  /** Strictly increasing, never reused or edited once released. */
  version: number;
  name: string;
  /** SQL applied inside a transaction. */
  up: string;
}
