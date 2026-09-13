/**
 * `ISO_3166_1_ALPHA_2` codes are used wherever one exists. `INTERNAL` codes are
 * reserved for places without an ISO code; they are stable once released.
 */
export type CountryCodeType = 'ISO_3166_1_ALPHA_2' | 'INTERNAL';

export interface CountryDefinition {
  /** Stable identifier stored in the database. Never the display name. */
  code: string;
  /** Canonical display name, as used by the collection assignment. */
  name: string;
  /** Name used when building search text (spelled out, no abbreviations or "&"). */
  queryName: string;
  aliases: readonly string[];
  codeType: CountryCodeType;
}
