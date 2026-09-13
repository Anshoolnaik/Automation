import { describe, expect, it } from 'vitest';

import { TRANSCRIPT_KEYWORDS } from '../config/transcript-keywords.js';
import { createTestContext } from '../testing/planning-fixtures.js';
import { countryBroadStrategy } from './country-broad.strategy.js';
import { countryLevelStrategy } from './country-level.strategy.js';
import { institutionBroadStrategy } from './institution-broad.strategy.js';
import { institutionLevelStrategy } from './institution-level.strategy.js';
import { institutionKeywordVariantStrategy } from './keyword-variant.strategy.js';
import { PRIORITY_BASE, scorePriority } from './priority.js';
import { programSpecificStrategy } from './program-specific.strategy.js';
import { joinQuery, quoted } from './search-strategy.js';

const texts = (candidates: { queryText: string }[]) => candidates.map((c) => c.queryText);

describe('COUNTRY_BROAD strategy', () => {
  it('pairs each country with every selected keyword spelling', () => {
    const candidates = countryBroadStrategy.generate(createTestContext({ countries: ['CA'] }));
    expect(texts(candidates)).toEqual([
      'Canada transcript',
      'Canada academic record',
      'Canada academic records',
      'Canada statement of results',
      'Canada statement of result',
    ]);
    expect(candidates.every((c) => c.institutionId === null && c.educationLevel === null)).toBe(
      true,
    );
  });

  it('uses spelled-out country query names', () => {
    const candidates = countryBroadStrategy.generate(
      createTestContext({ countries: ['KN'], keywords: ['transcript'] }),
    );
    expect(texts(candidates)).toEqual(['Saint Kitts and Nevis transcript']);
  });
});

describe('COUNTRY_LEVEL strategy', () => {
  it('combines country, each level query term and the primary keyword', () => {
    const candidates = countryLevelStrategy.generate(createTestContext({ countries: ['CA'] }));
    expect(texts(candidates)).toEqual([
      'Canada diploma transcript',
      'Canada bachelor transcript',
      'Canada BSc transcript',
      'Canada master transcript',
      'Canada MSc transcript',
    ]);
    expect(candidates.map((c) => c.educationLevel)).toEqual([
      'DIPLOMA',
      'BACHELOR',
      'BACHELOR',
      'MASTER',
      'MASTER',
    ]);
  });
});

describe('INSTITUTION_BROAD strategy', () => {
  it('quotes the institution name and adds the primary keyword', () => {
    const candidates = institutionBroadStrategy.generate(createTestContext({ countries: ['CA'] }));
    expect(texts(candidates)).toContain('"University of Toronto" transcript');
    expect(candidates.find((c) => c.queryText.startsWith('"University of Toronto"'))).toMatchObject(
      {
        institutionId: 'ca-university-of-toronto',
        countryCode: 'CA',
        transcriptKeywordId: 'transcript',
      },
    );
  });

  it('generates nothing when institutions are excluded', () => {
    expect(
      institutionBroadStrategy.generate(createTestContext({ includeInstitutions: false })),
    ).toEqual([]);
  });
});

describe('INSTITUTION_LEVEL strategy', () => {
  it('produces level-specific institution queries', () => {
    const candidates = institutionLevelStrategy.generate(createTestContext({ countries: ['CA'] }));
    expect(texts(candidates)).toEqual(
      expect.arrayContaining([
        '"University of Toronto" diploma transcript',
        '"University of Toronto" bachelor transcript',
        '"University of Toronto" MSc transcript',
      ]),
    );
  });
});

describe('INSTITUTION_KEYWORD_VARIANT strategy', () => {
  it('uses other keywords, capped by maxVariationsPerInstitution', () => {
    const all = institutionKeywordVariantStrategy.generate(
      createTestContext({ countries: ['NG'] }),
    );
    expect(texts(all)).toEqual(
      expect.arrayContaining([
        '"University of Lagos" academic record',
        '"University of Lagos" statement of results',
      ]),
    );

    const capped = institutionKeywordVariantStrategy.generate(
      createTestContext({
        countries: ['NG'],
        keywords: TRANSCRIPT_KEYWORDS.map((k) => k.id),
        maxVariationsPerInstitution: 2,
      }),
    );
    const lagos = capped.filter((c) => c.institutionId === 'ng-university-of-lagos');
    expect(texts(lagos)).toEqual([
      '"University of Lagos" academic transcript',
      '"University of Lagos" academic record',
    ]);
  });
});

describe('PROGRAM_SPECIFIC strategy', () => {
  it('generates nothing unless programs are supplied', () => {
    expect(programSpecificStrategy.generate(createTestContext())).toEqual([]);
  });

  it('generates country and institution program queries', () => {
    const candidates = programSpecificStrategy.generate(
      createTestContext({ countries: ['CA'], programNames: ['Computer Science'] }),
    );
    expect(texts(candidates)).toEqual(
      expect.arrayContaining([
        'Canada "Computer Science" transcript',
        '"University of Toronto" "Computer Science" transcript',
      ]),
    );
    expect(candidates.every((c) => c.program === 'Computer Science')).toBe(true);
  });
});

describe('priority assignment', () => {
  const keyword = TRANSCRIPT_KEYWORDS[0]!;
  const weakest = TRANSCRIPT_KEYWORDS.at(-1)!;

  it('ranks query kinds in the documented order regardless of keyword and variant', () => {
    const ordered = [
      'INSTITUTION_BROAD',
      'INSTITUTION_PROGRAM',
      'INSTITUTION_LEVEL',
      'COUNTRY_PROGRAM',
      'COUNTRY_BROAD',
      'COUNTRY_LEVEL',
      'INSTITUTION_KEYWORD_VARIANT',
    ] as const;
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const lowestOfHigher = scorePriority(ordered[i]!, weakest, 4);
      const highestOfLower = scorePriority(ordered[i + 1]!, keyword, 0);
      expect(lowestOfHigher).toBeGreaterThan(highestOfLower);
    }
  });

  it('prefers stronger keywords and primary spellings within a kind', () => {
    expect(scorePriority('COUNTRY_BROAD', keyword)).toBe(PRIORITY_BASE.COUNTRY_BROAD + 10);
    expect(scorePriority('COUNTRY_BROAD', weakest)).toBeLessThan(
      scorePriority('COUNTRY_BROAD', keyword),
    );
    expect(scorePriority('COUNTRY_BROAD', keyword, 1)).toBe(PRIORITY_BASE.COUNTRY_BROAD + 8);
  });

  it('gives institution + transcript the highest priority among generated candidates', () => {
    const context = createTestContext({ countries: ['CA'] });
    const broad = institutionBroadStrategy.generate(context)[0]!;
    const others = [
      ...institutionLevelStrategy.generate(context),
      ...countryBroadStrategy.generate(context),
      ...countryLevelStrategy.generate(context),
      ...institutionKeywordVariantStrategy.generate(context),
    ];
    expect(Math.max(...others.map((c) => c.priority))).toBeLessThan(broad.priority);
  });
});

describe('query text helpers', () => {
  it('quotes names safely and joins parts with single spaces', () => {
    expect(quoted(' The "Best"  College ')).toBe('"The Best College"');
    expect(joinQuery(' Canada ', '', 'transcript ')).toBe('Canada transcript');
  });
});
