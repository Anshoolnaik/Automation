import type { Institution } from '../domain/institution.js';
import { INSTITUTION_FIXTURES } from './fixtures/institution-fixtures.js';
import type { InstitutionProvider } from './institution-provider.js';

/** In-memory provider for development and tests. */
export class StaticInstitutionProvider implements InstitutionProvider {
  readonly name = 'static';

  constructor(private readonly institutions: readonly Institution[] = INSTITUTION_FIXTURES) {}

  getInstitutions(countryCode: string): Promise<Institution[]> {
    const code = countryCode.toUpperCase();
    return Promise.resolve(
      this.institutions
        .filter((institution) => institution.countryCode === code)
        .map((institution) => ({ ...institution, aliases: [...institution.aliases] })),
    );
  }
}
