import { describe, expect, it } from 'vitest';

import { EDUCATION_LEVELS } from '../domain/education-level.js';
import { normalizeText } from '../query/normalize-query.js';
import { ASSIGNMENT_COUNTRIES, findCountry, resolveCountry } from './countries.js';
import {
  EDUCATION_LEVEL_DEFINITIONS,
  educationLevelsAtOrAbove,
  getEducationLevelDefinition,
} from './education-levels.js';
import { TRANSCRIPT_KEYWORDS } from './transcript-keywords.js';

/** The exact country list from the collection assignment. */
const ASSIGNMENT_COUNTRY_NAMES = [
  'American Samoa', 'Dominica', 'Lesotho', 'St. Kitts & Nevis', 'Anguilla', 'Falkland Islands',
  'Liberia', 'St. Lucia', 'Antigua & Barbuda', 'Fiji', 'Malta', 'St. Vincent & the Grenadines',
  'Australia', 'Gambia', 'Mauritius', 'Tanzania', 'Bahamas', 'Ghana', 'Montserrat',
  'Trinidad & Tobago', 'Barbados', 'Gibraltar', 'New Zealand', 'Turks & Caicos Islands', 'Belize',
  'Grenada', 'Nigeria', 'Uganda', 'Bermuda', 'Guam', 'Seychelles', 'United Kingdom', 'Botswana',
  'Guyana', 'Sierra Leone', 'US Virgin Islands', 'British Virgin Islands', 'Ireland', 'Singapore',
  'USA', 'Canada', 'Jamaica', 'South Africa', 'Zambia', 'Cayman Islands', 'Kenya', 'St. Helena',
  'Zimbabwe',
]; // prettier-ignore

describe('country configuration', () => {
  it('contains exactly the 48 assignment countries', () => {
    expect(ASSIGNMENT_COUNTRIES).toHaveLength(48);
    expect(ASSIGNMENT_COUNTRIES.map((c) => c.name).sort()).toEqual(
      [...ASSIGNMENT_COUNTRY_NAMES].sort(),
    );
  });

  it('uses unique ISO 3166-1 alpha-2 codes, never names, as identifiers', () => {
    const codes = ASSIGNMENT_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const country of ASSIGNMENT_COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.codeType).toBe('ISO_3166_1_ALPHA_2');
    }
    expect(findCountry('ca')?.name).toBe('Canada');
    expect(findCountry('GB')?.name).toBe('United Kingdom');
    expect(findCountry('US')?.name).toBe('USA');
    expect(findCountry('SH')?.name).toBe('St. Helena');
  });

  it('keeps names and aliases unambiguous after normalization', () => {
    const owner = new Map<string, string>();
    for (const country of ASSIGNMENT_COUNTRIES) {
      for (const label of new Set(
        [country.code, country.name, country.queryName, ...country.aliases].map(normalizeText),
      )) {
        expect(owner.get(label) ?? country.code, `"${label}" is claimed twice`).toBe(country.code);
        owner.set(label, country.code);
      }
    }
  });

  it.each([
    ['Canadian', 'CA'],
    ['st kitts and nevis', 'KN'],
    ['UK', 'GB'],
    ['United States of America', 'US'],
    ['The Gambia', 'GM'],
    ['us virgin islands', 'VI'],
    ['British Virgin Islands', 'VG'],
    ['zw', 'ZW'],
  ])('resolves %j to %s', (input, code) => {
    expect(resolveCountry(input)?.code).toBe(code);
  });

  it('uses spelled-out query names instead of abbreviations and "&"', () => {
    for (const country of ASSIGNMENT_COUNTRIES) {
      expect(country.queryName).not.toMatch(/&|\bSt\./);
    }
  });
});

describe('education level vocabulary', () => {
  it('defines every canonical level once', () => {
    expect(EDUCATION_LEVEL_DEFINITIONS.map((d) => d.level)).toEqual([...EDUCATION_LEVELS]);
  });

  it('has short query terms drawn from its vocabulary', () => {
    for (const definition of EDUCATION_LEVEL_DEFINITIONS) {
      expect(definition.queryTerms.length).toBeGreaterThan(0);
      expect(definition.queryTerms.length).toBeLessThanOrEqual(3);
      const vocabulary = new Set(definition.vocabulary.map(normalizeText));
      for (const term of definition.queryTerms)
        expect(vocabulary.has(normalizeText(term))).toBe(true);
    }
  });

  it('includes the expected degree terms', () => {
    expect(getEducationLevelDefinition('BACHELOR').vocabulary).toEqual(
      expect.arrayContaining([
        'bachelor',
        "bachelor's",
        'bachelors',
        'undergraduate',
        'BSc',
        'BA',
        'BEng',
        'BCom',
      ]),
    );
    expect(getEducationLevelDefinition('MASTER').vocabulary).toEqual(
      expect.arrayContaining(['master', "master's", 'masters', 'MSc', 'MA', 'MBA', 'MTech']),
    );
  });

  it('selects "Diploma and above" by rank, supporting configurable subsets', () => {
    expect(educationLevelsAtOrAbove('DIPLOMA')).toEqual([...EDUCATION_LEVELS]);
    expect(educationLevelsAtOrAbove('MASTER')).toEqual(['MASTER', 'DOCTORATE']);
  });
});

describe('transcript keyword taxonomy', () => {
  const requiredTerms = [
    'transcript', 'academic transcript', 'academic record', 'academic records', 'grade sheet',
    'grade sheets', 'mark sheet', 'mark sheets', 'marksheet', 'marksheets', 'statement of results',
    'statement of result', 'degree transcript', 'college transcript', 'university transcript',
    'academic statement',
  ]; // prettier-ignore

  it('covers the required terminology', () => {
    const terms = TRANSCRIPT_KEYWORDS.flatMap((keyword) => keyword.terms);
    expect(terms).toEqual(expect.arrayContaining(requiredTerms));
  });

  it('has unique IDs, valid priorities and no equivalent duplicate terms', () => {
    const ids = TRANSCRIPT_KEYWORDS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    const normalizedTerms = TRANSCRIPT_KEYWORDS.flatMap((k) => k.terms.map(normalizeText));
    expect(new Set(normalizedTerms).size).toBe(normalizedTerms.length);
    for (const keyword of TRANSCRIPT_KEYWORDS) {
      expect(keyword.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(keyword.priority).toBeGreaterThanOrEqual(0);
      expect(keyword.priority).toBeLessThanOrEqual(100);
    }
  });

  it('is ordered by priority, highest first', () => {
    const priorities = TRANSCRIPT_KEYWORDS.map((k) => k.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});
