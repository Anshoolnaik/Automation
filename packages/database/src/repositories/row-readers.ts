import type { SqlRow } from '../sqlite/sqlite-database.js';

/** Typed column readers: fail loudly if the schema and the code disagree. */

export function readString(row: SqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') {
    throw new TypeError(`Expected column "${column}" to be TEXT, got ${typeof value}`);
  }
  return value;
}

export function readNullableString(row: SqlRow, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new TypeError(`Expected column "${column}" to be TEXT or NULL, got ${typeof value}`);
  }
  return value;
}

export function readEnum<T extends string>(row: SqlRow, column: string, allowed: readonly T[]): T {
  const value = readString(row, column);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new TypeError(`Unexpected value "${value}" in column "${column}"`);
  }
  return value as T;
}

export function readJson(row: SqlRow, column: string): unknown {
  return JSON.parse(readString(row, column)) as unknown;
}

export function readJsonObject(row: SqlRow, column: string): Record<string, unknown> {
  const value = readJson(row, column);
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readInteger(row: SqlRow, column: string): number {
  const value = row[column];
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  throw new TypeError(`Expected column "${column}" to be INTEGER, got ${typeof value}`);
}

export function readBoolean(row: SqlRow, column: string): boolean {
  return readInteger(row, column) !== 0;
}

export function readNullableJson(row: SqlRow, column: string): unknown {
  const value = readNullableString(row, column);
  return value === null ? null : (JSON.parse(value) as unknown);
}
