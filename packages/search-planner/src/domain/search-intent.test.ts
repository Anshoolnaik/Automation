import { describe, expect, it } from 'vitest';

import { TRANSCRIPT_SEARCH_VOCABULARY } from '../config/vocabulary.js';
import { SearchError } from './errors.js';
import { parseSearchIntent } from './search-intent.js';

const parse = (input: unknown) => parseSearchIntent(input, TRANSCRIPT_SEARCH_VOCABULARY);

const valid = {
  countries: ['CA', 'US'],
  educationLevels: ['BACHELOR', 'DIPLOMA'],
  includeInstitutions: true,
  keywords: ['transcript', 'statement-of-results'],
};

describe('SearchIntent validation', () => {
  it('accepts a valid intent and canonicalizes order and duplicates', () => {
    expect(
      parse({
        ...valid,
        countries: ['us', 'CA', 'US'],
        educationLevels: ['MASTER', 'DIPLOMA', 'MASTER'],
        keywords: ['statement-of-results', 'transcript'],
        programNames: ['  Nursing ', 'computer   science', 'Computer Science'],
        maxVariationsPerInstitution: 4,
      }),
    ).toEqual({
      countries: ['CA', 'US'],
      educationLevels: ['DIPLOMA', 'MASTER'],
      includeInstitutions: true,
      keywords: ['transcript', 'statement-of-results'],
      programNames: ['computer science', 'Nursing'],
      maxVariationsPerInstitution: 4,
    });
  });

  it('gives equivalent intents an identical canonical form', () => {
    const a = parse({ ...valid, countries: ['US', 'CA'] });
    const b = parse({
      ...valid,
      countries: ['ca', 'us'],
      educationLevels: ['DIPLOMA', 'BACHELOR'],
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('defaults includeInstitutions to true', () => {
    const { includeInstitutions, ...rest } = valid;
    expect(includeInstitutions).toBe(true);
    expect(parse(rest).includeInstitutions).toBe(true);
  });

  it.each([
    ['unknown country code', { ...valid, countries: ['CA', 'XX'] }, /Unknown country code: XX/],
    [
      'a country name instead of a code',
      { ...valid, countries: ['Canada'] },
      /Unknown country code/,
    ],
    ['empty country list', { ...valid, countries: [] }, /at least one country/],
    ['empty keywords', { ...valid, keywords: [] }, /at least one transcript keyword/],
    [
      'unknown keyword',
      { ...valid, keywords: ['diploma-certificate'] },
      /Unknown transcript keyword/,
    ],
    ['invalid education level', { ...valid, educationLevels: ['HIGH_SCHOOL'] }, /educationLevels/],
    ['empty education levels', { ...valid, educationLevels: [] }, /at least one education level/],
    ['unknown fields', { ...valid, source: 'scribd' }, /Unrecognized key/],
    [
      'too many variations',
      { ...valid, maxVariationsPerInstitution: 500 },
      /maxVariationsPerInstitution/,
    ],
    ['non-object input', 'Canada transcripts', /Invalid search intent/],
  ])('rejects %s', (_label, input, message) => {
    expect(() => parse(input)).toThrow(SearchError);
    expect(() => parse(input)).toThrow(message);
  });

  it('reports the SEARCH_INTENT_INVALID code', () => {
    try {
      parse({ ...valid, countries: [] });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: 'SEARCH_INTENT_INVALID' });
    }
  });
});
