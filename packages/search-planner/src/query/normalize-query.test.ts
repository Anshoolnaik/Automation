import { describe, expect, it } from 'vitest';

import { createJobId, createQueryId, normalizeText, queryIdentity } from './normalize-query.js';

describe('normalizeText', () => {
  it.each([
    ['University  of Toronto transcript', 'University of Toronto   transcript'],
    ['UNIVERSITY OF TORONTO TRANSCRIPT', 'university of toronto transcript'],
    ['"University of Toronto" transcript', 'University of Toronto transcript'],
    ['“University of Toronto” transcript', 'University of Toronto transcript'],
    ["bachelor's transcript", 'bachelors transcript'],
    ['bachelor’s transcript', 'bachelors transcript'],
    ['B.Sc. transcript', 'BSc transcript'],
    ['Université de Montréal', 'Universite de Montreal'],
    ['Université de Montréal', 'Université de Montréal'],
    ['St. Kitts & Nevis transcript', 'St Kitts and Nevis transcript'],
    ['University of California, Berkeley', 'University of California Berkeley'],
    ['mark-sheet', 'mark sheet'],
    ['  \t transcript \n', 'transcript'],
    ['ｔｒａｎｓｃｒｉｐｔ', 'transcript'],
  ])('treats %j and %j as the same search', (a, b) => {
    expect(normalizeText(a)).toBe(normalizeText(b));
  });

  it.each([
    ['C++ transcript', 'C transcript'],
    ['C# programming', 'C programming'],
    ['marksheet', 'mark sheet'],
    ['academic record', 'academic records'],
  ])('keeps %j and %j distinct', (a, b) => {
    expect(normalizeText(a)).not.toBe(normalizeText(b));
  });

  it('produces the canonical form', () => {
    expect(normalizeText('  "King’s College London"  Academic   Record ')).toBe(
      'kings college london academic record',
    );
  });

  it('does not strip marks that are essential in non-Latin scripts', () => {
    expect(normalizeText('प्रतिलिपि')).not.toBe(normalizeText('पतलप'));
  });
});

describe('queryIdentity', () => {
  it('gives the same SHA-256 hash to the same logical query', () => {
    const a = queryIdentity('"University of Toronto"  transcript');
    const b = queryIdentity('university of toronto TRANSCRIPT');
    expect(a).toEqual(b);
    expect(a.queryHash).toMatch(/^[0-9a-f]{64}$/);
    // Stable across runs and platforms: SHA-256 of "canada transcript".
    expect(queryIdentity('Canada   Transcript')).toEqual({
      normalizedQuery: 'canada transcript',
      queryHash: 'cd6714cc6246a9f222ecf4f97c4aeb27c1b7a0ad65bb8df90e552f54b0671c8d',
    });
  });

  it('derives deterministic query and job IDs that depend on campaign and source', () => {
    const { queryHash } = queryIdentity('Canada transcript');
    expect(createQueryId('c1', queryHash)).toBe(createQueryId('c1', queryHash));
    expect(createQueryId('c1', queryHash)).not.toBe(createQueryId('c2', queryHash));
    expect(createJobId('c1', 'scribd', queryHash)).not.toBe(createJobId('c1', 'other', queryHash));
    expect(createQueryId('c1', queryHash)).toMatch(/^q_[0-9a-f]{32}$/);
  });
});
