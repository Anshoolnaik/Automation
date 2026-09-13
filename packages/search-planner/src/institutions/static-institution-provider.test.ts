import { describe, expect, it } from 'vitest';

import { findCountry } from '../config/countries.js';
import { InstitutionSchema, createInstitutionId } from '../domain/institution.js';
import { INSTITUTION_FIXTURES } from './fixtures/institution-fixtures.js';
import { StaticInstitutionProvider } from './static-institution-provider.js';

describe('StaticInstitutionProvider', () => {
  it('returns only institutions of the requested country', async () => {
    const provider = new StaticInstitutionProvider();
    const canadian = await provider.getInstitutions('ca');
    expect(canadian.map((i) => i.name)).toContain('University of Toronto');
    expect(canadian.every((i) => i.countryCode === 'CA')).toBe(true);
    expect(await provider.getInstitutions('FJ')).toEqual([]);
  });

  it('returns copies so callers cannot mutate the fixtures', async () => {
    const provider = new StaticInstitutionProvider();
    const [first] = await provider.getInstitutions('CA');
    (first!.aliases as string[]).push('mutated');
    const [again] = await provider.getInstitutions('CA');
    expect(again!.aliases).not.toContain('mutated');
  });

  it('keeps the fixture dataset small, valid and limited to five countries', () => {
    expect(INSTITUTION_FIXTURES.length).toBeLessThanOrEqual(30);
    expect(new Set(INSTITUTION_FIXTURES.map((i) => i.countryCode))).toEqual(
      new Set(['CA', 'US', 'GB', 'NG', 'AU']),
    );
    const ids = INSTITUTION_FIXTURES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const institution of INSTITUTION_FIXTURES) {
      expect(InstitutionSchema.safeParse(institution).success).toBe(true);
      expect(findCountry(institution.countryCode)).toBeDefined();
    }
  });
});

describe('createInstitutionId', () => {
  it('derives a stable, readable ID from country and name', () => {
    expect(createInstitutionId('CA', 'University of Toronto')).toBe('ca-university-of-toronto');
    expect(createInstitutionId('GB', "King's College London")).toBe('gb-kings-college-london');
    expect(createInstitutionId('US', 'University of California, Berkeley')).toBe(
      'us-university-of-california-berkeley',
    );
  });

  it('falls back to a hash for names without ASCII letters', () => {
    expect(createInstitutionId('SG', '新加坡国立大学')).toMatch(/^sg-[0-9a-f]{16}$/);
  });
});
