import { describe, expect, it } from 'vitest';

import { EDUCATION_LEVELS } from '../domain/education-level.js';
import { ALL_TRANSCRIPT_KEYWORD_IDS } from '../config/transcript-keywords.js';
import { INSTITUTION_FIXTURES } from '../institutions/fixtures/institution-fixtures.js';
import { DEFAULT_SEARCH_STRATEGIES } from '../strategies/default-strategies.js';
import type { SearchStrategy } from '../strategies/search-strategy.js';
import { createTestContext, syntheticInstitutions } from '../testing/planning-fixtures.js';
import { DEFAULT_PLANNING_LIMITS, resolvePlanningLimits } from './planning-limits.js';
import { generateSearchQueries } from './query-generator.js';

const generous = resolvePlanningLimits({
  maxQueriesPerCountry: 100_000,
  maxQueriesPerInstitution: 1_000,
  maxTotalQueries: 1_000_000,
});

describe('generateSearchQueries', () => {
  it('produces unique, normalized, hashed queries with deterministic IDs', () => {
    const { queries } = generateSearchQueries(
      createTestContext(),
      DEFAULT_SEARCH_STRATEGIES,
      generous,
    );
    const hashes = queries.map((q) => q.queryHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    for (const query of queries) {
      expect(query.campaignId).toBe('campaign-test');
      expect(query.queryHash).toMatch(/^[0-9a-f]{64}$/);
      expect(query.id).toMatch(/^q_[0-9a-f]{32}$/);
      expect(query.normalizedQuery).toBe(query.normalizedQuery.toLowerCase().trim());
    }
    expect(queries.map((q) => q.queryText)).toEqual(
      expect.arrayContaining([
        'Canada transcript',
        'Canada diploma transcript',
        '"University of Toronto" transcript',
        '"University of Toronto" bachelor transcript',
        '"University of Toronto" statement of results',
      ]),
    );
  });

  it('removes equivalent duplicates, keeping the higher-priority candidate', () => {
    const noisy: SearchStrategy = {
      id: 'COUNTRY_BROAD',
      generate: () => [
        candidate('Canada   Transcript', 10),
        candidate('"Canada" transcript', 50),
        candidate('canada transcript', 20),
        candidate('Canada academic record', 5),
      ],
    };
    const { queries, statistics } = generateSearchQueries(createTestContext(), [noisy], generous);
    expect(queries.map((q) => [q.queryText, q.priority])).toEqual([
      ['"Canada" transcript', 50],
      ['Canada academic record', 5],
    ]);
    expect(statistics).toMatchObject({
      generatedCandidates: 4,
      deduplicatedCandidates: 2,
      duplicatesRemoved: 2,
      acceptedQueries: 2,
      discardedByLimit: 0,
      limitReached: false,
    });
  });

  it('orders accepted queries by priority, then country, institution and text', () => {
    const { queries } = generateSearchQueries(
      createTestContext(),
      DEFAULT_SEARCH_STRATEGIES,
      generous,
    );
    const priorities = queries.map((q) => q.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
    expect(queries[0]).toMatchObject({ strategyId: 'INSTITUTION_BROAD', countryCode: 'CA' });
  });

  it('is deterministic: same input gives identical output, independent of input order', () => {
    const first = generateSearchQueries(
      createTestContext(),
      DEFAULT_SEARCH_STRATEGIES,
      DEFAULT_PLANNING_LIMITS,
    );
    const second = generateSearchQueries(
      createTestContext(
        { countries: ['GB', 'ca'], educationLevels: ['MASTER', 'DIPLOMA', 'BACHELOR'] },
        [...INSTITUTION_FIXTURES].reverse(),
      ),
      DEFAULT_SEARCH_STRATEGIES,
      DEFAULT_PLANNING_LIMITS,
    );
    expect(second).toEqual(first);
  });

  describe('planning limits', () => {
    it('caps queries per institution, discarding the lowest priority ones first', () => {
      const context = createTestContext({ countries: ['CA'] });
      const { queries, statistics } = generateSearchQueries(context, DEFAULT_SEARCH_STRATEGIES, {
        ...generous,
        maxQueriesPerInstitution: 3,
      });
      const toronto = queries.filter((q) => q.institutionId === 'ca-university-of-toronto');
      expect(toronto.map((q) => q.queryText)).toEqual([
        '"University of Toronto" transcript',
        '"University of Toronto" bachelor transcript',
        '"University of Toronto" diploma transcript',
      ]);
      expect(statistics.discardedByReason.maxQueriesPerInstitution).toBeGreaterThan(0);
      expect(statistics.limitReached).toBe(true);
    });

    it('caps queries per country and in total, and accounts for every discarded query', () => {
      const context = createTestContext({ countries: ['CA', 'GB'] });
      const perCountry = generateSearchQueries(context, DEFAULT_SEARCH_STRATEGIES, {
        ...generous,
        maxQueriesPerCountry: 10,
      });
      expect(perCountry.queries.filter((q) => q.countryCode === 'CA')).toHaveLength(10);
      expect(perCountry.queries.filter((q) => q.countryCode === 'GB')).toHaveLength(10);

      const total = generateSearchQueries(context, DEFAULT_SEARCH_STRATEGIES, {
        ...generous,
        maxTotalQueries: 7,
      });
      expect(total.queries).toHaveLength(7);
      for (const { statistics } of [perCountry, total]) {
        expect(statistics.acceptedQueries + statistics.discardedByLimit).toBe(
          statistics.deduplicatedCandidates,
        );
      }
      expect(total.statistics.discardedByReason.maxTotalQueries).toBeGreaterThan(0);
    });

    it('prevents a Cartesian explosion for a country with thousands of institutions', () => {
      const institutions = syntheticInstitutions('CA', 5_000);
      const context = createTestContext(
        {
          countries: ['CA'],
          educationLevels: [...EDUCATION_LEVELS],
          keywords: [...ALL_TRANSCRIPT_KEYWORD_IDS],
        },
        institutions,
      );
      const started = performance.now();
      const { queries, statistics } = generateSearchQueries(
        context,
        DEFAULT_SEARCH_STRATEGIES,
        DEFAULT_PLANNING_LIMITS,
      );
      const elapsedMs = performance.now() - started;

      // Uncapped, this would be tens of thousands of queries for one country.
      expect(statistics.deduplicatedCandidates).toBeGreaterThan(50_000);
      expect(queries.length).toBeLessThanOrEqual(DEFAULT_PLANNING_LIMITS.maxQueriesPerCountry);
      expect(statistics.discardedByLimit).toBe(statistics.deduplicatedCandidates - queries.length);
      expect(statistics.limitReached).toBe(true);
      expect(elapsedMs).toBeLessThan(10_000);
    });
  });
});

function candidate(queryText: string, priority: number) {
  return {
    strategyId: 'COUNTRY_BROAD' as const,
    countryCode: 'CA',
    institutionId: null,
    educationLevel: null,
    transcriptKeywordId: 'transcript',
    program: null,
    queryText,
    priority,
  };
}
