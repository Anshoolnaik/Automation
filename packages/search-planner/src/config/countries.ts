import type { CountryDefinition } from '../domain/country.js';
import { normalizeText } from '../query/normalize-query.js';

const iso = (
  code: string,
  name: string,
  aliases: readonly string[],
  queryName: string = name,
): CountryDefinition => ({ code, name, queryName, aliases, codeType: 'ISO_3166_1_ALPHA_2' });

/**
 * Countries and territories accepted by the transcript collection assignment.
 * Every entry has an ISO 3166-1 alpha-2 code, so no internal codes are needed yet.
 * Order is the canonical planning order (alphabetical by display name).
 */
export const ASSIGNMENT_COUNTRIES: readonly CountryDefinition[] = [
  iso('AS', 'American Samoa', ['American Samoan']),
  iso('AI', 'Anguilla', ['Anguillan']),
  iso('AG', 'Antigua & Barbuda', ['Antigua and Barbuda', 'Antiguan'], 'Antigua and Barbuda'),
  iso('AU', 'Australia', ['Australian']),
  iso('BS', 'Bahamas', ['The Bahamas', 'Bahamian']),
  iso('BB', 'Barbados', ['Barbadian', 'Bajan']),
  iso('BZ', 'Belize', ['Belizean']),
  iso('BM', 'Bermuda', ['Bermudian']),
  iso('BW', 'Botswana', ['Motswana', 'Batswana']),
  iso('VG', 'British Virgin Islands', ['BVI', 'Virgin Islands British']),
  iso('CA', 'Canada', ['Canadian']),
  iso('KY', 'Cayman Islands', ['Caymanian', 'Cayman']),
  iso('DM', 'Dominica', ['Commonwealth of Dominica']),
  iso('FK', 'Falkland Islands', ['Falklands', 'Falkland Islander']),
  iso('FJ', 'Fiji', ['Fijian']),
  iso('GM', 'Gambia', ['The Gambia', 'Gambian']),
  iso('GH', 'Ghana', ['Ghanaian']),
  iso('GI', 'Gibraltar', ['Gibraltarian']),
  iso('GD', 'Grenada', ['Grenadian']),
  iso('GU', 'Guam', ['Guamanian']),
  iso('GY', 'Guyana', ['Guyanese']),
  iso('IE', 'Ireland', ['Republic of Ireland', 'Irish']),
  iso('JM', 'Jamaica', ['Jamaican']),
  iso('KE', 'Kenya', ['Kenyan']),
  iso('LS', 'Lesotho', ['Basotho', 'Mosotho']),
  iso('LR', 'Liberia', ['Liberian']),
  iso('MT', 'Malta', ['Maltese']),
  iso('MU', 'Mauritius', ['Mauritian']),
  iso('MS', 'Montserrat', ['Montserratian']),
  iso('NZ', 'New Zealand', ['New Zealander', 'Aotearoa']),
  iso('NG', 'Nigeria', ['Nigerian']),
  iso('SC', 'Seychelles', ['Seychellois']),
  iso('SL', 'Sierra Leone', ['Sierra Leonean']),
  iso('SG', 'Singapore', ['Singaporean']),
  iso('ZA', 'South Africa', ['South African', 'RSA']),
  iso('SH', 'St. Helena', ['Saint Helena', 'St Helenian'], 'Saint Helena'),
  iso(
    'KN',
    'St. Kitts & Nevis',
    ['Saint Kitts and Nevis', 'St Kitts', 'Kittitian', 'Nevisian'],
    'Saint Kitts and Nevis',
  ),
  iso('LC', 'St. Lucia', ['Saint Lucia', 'Saint Lucian'], 'Saint Lucia'),
  iso(
    'VC',
    'St. Vincent & the Grenadines',
    ['Saint Vincent and the Grenadines', 'St Vincent', 'Vincentian'],
    'Saint Vincent and the Grenadines',
  ),
  iso('TZ', 'Tanzania', ['United Republic of Tanzania', 'Tanzanian']),
  iso(
    'TT',
    'Trinidad & Tobago',
    ['Trinidad and Tobago', 'Trinidadian', 'Tobagonian'],
    'Trinidad and Tobago',
  ),
  iso('TC', 'Turks & Caicos Islands', ['Turks and Caicos', 'TCI'], 'Turks and Caicos Islands'),
  iso('UG', 'Uganda', ['Ugandan']),
  iso('GB', 'United Kingdom', ['UK', 'Great Britain', 'Britain', 'British']),
  iso(
    'US',
    'USA',
    ['United States', 'United States of America', 'U.S.', 'American'],
    'United States',
  ),
  iso('VI', 'US Virgin Islands', ['United States Virgin Islands', 'USVI', 'Virgin Islands US']),
  iso('ZM', 'Zambia', ['Zambian']),
  iso('ZW', 'Zimbabwe', ['Zimbabwean']),
];

const byCode = new Map(ASSIGNMENT_COUNTRIES.map((country) => [country.code, country]));

const byNormalizedName = new Map<string, CountryDefinition>();
for (const country of ASSIGNMENT_COUNTRIES) {
  for (const label of [country.code, country.name, country.queryName, ...country.aliases]) {
    byNormalizedName.set(normalizeText(label), country);
  }
}

export function findCountry(code: string): CountryDefinition | undefined {
  return byCode.get(code.toUpperCase());
}

/** Resolves a code, display name or alias ("Canadian", "St Kitts", "UK") to a country. */
export function resolveCountry(nameOrCode: string): CountryDefinition | undefined {
  return (
    byCode.get(nameOrCode.trim().toUpperCase()) ?? byNormalizedName.get(normalizeText(nameOrCode))
  );
}
