import type { Institution } from '../domain/institution.js';

/**
 * Supplies the institutions of one country. Phase 2 ships a static fixture
 * provider; later phases add real discovery or import (registries, CSV, APIs).
 */
export interface InstitutionProvider {
  readonly name: string;
  getInstitutions(countryCode: string): Promise<Institution[]>;
}
