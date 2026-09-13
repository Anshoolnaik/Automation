import type { SqlParams } from '../../sqlite/sqlite-database.js';

/**
 * Builds a named-parameter IN list (`:status0, :status1`) for values that are
 * first checked against an allow-list, so no caller text reaches the SQL.
 */
export function inList<T extends string>(
  prefix: string,
  values: readonly T[],
  allowed: readonly T[],
): { sql: string; params: SqlParams } {
  if (values.length === 0) throw new Error(`Empty ${prefix} list`);
  const params: SqlParams = {};
  const names = values.map((value, index) => {
    if (!allowed.includes(value)) throw new Error(`Unexpected ${prefix} value: ${value}`);
    const name = `${prefix}${index}`;
    params[name] = value;
    return `:${name}`;
  });
  return { sql: names.join(', '), params };
}

export const flag = (value: boolean | undefined): number => (value ? 1 : 0);
