import {
  INSTITUTION_TYPES,
  normalizeText,
  type Institution,
  type InstitutionStore,
} from '@atlas/search-planner';
import { z } from 'zod';

import type { SqlRow } from '../../sqlite/sqlite-database.js';
import { timestamp, type RepositoryContext } from '../repository-context.js';
import { readEnum, readJson, readString } from '../row-readers.js';

export interface InstitutionRepository extends InstitutionStore {
  findInstitution(id: string): Institution | undefined;
  listInstitutions(countryCode: string): Institution[];
  countInstitutions(countryCode?: string): number;
}

const AliasesSchema = z.array(z.string());

export class SqliteInstitutionRepository implements InstitutionRepository {
  constructor(private readonly context: RepositoryContext) {}

  upsertInstitutions(institutions: readonly Institution[]): void {
    const now = timestamp(this.context);
    for (const institution of institutions) {
      this.context.db.run(
        `INSERT INTO institutions
           (id, country_code, name, normalized_name, aliases_json, institution_type, source, created_at, updated_at)
         VALUES (:id, :countryCode, :name, :normalizedName, :aliasesJson, :type, :source, :now, :now)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name,
           normalized_name = excluded.normalized_name,
           aliases_json = excluded.aliases_json,
           institution_type = excluded.institution_type,
           source = excluded.source,
           updated_at = excluded.updated_at
         WHERE institutions.name IS NOT excluded.name
            OR institutions.aliases_json IS NOT excluded.aliases_json
            OR institutions.institution_type IS NOT excluded.institution_type
            OR institutions.source IS NOT excluded.source`,
        {
          id: institution.id,
          countryCode: institution.countryCode,
          name: institution.name,
          normalizedName: normalizeText(institution.name),
          aliasesJson: JSON.stringify([...institution.aliases]),
          type: institution.type,
          source: institution.source,
          now,
        },
      );
    }
  }

  findInstitution(id: string): Institution | undefined {
    const row = this.context.db.get('SELECT * FROM institutions WHERE id = :id', { id });
    return row ? toInstitution(row) : undefined;
  }

  listInstitutions(countryCode: string): Institution[] {
    return this.context.db
      .all(
        'SELECT * FROM institutions WHERE country_code = :countryCode ORDER BY normalized_name, id',
        { countryCode },
      )
      .map(toInstitution);
  }

  countInstitutions(countryCode?: string): number {
    const row =
      countryCode === undefined
        ? this.context.db.get('SELECT COUNT(*) AS count FROM institutions')
        : this.context.db.get(
            'SELECT COUNT(*) AS count FROM institutions WHERE country_code = :countryCode',
            { countryCode },
          );
    return Number(row?.count ?? 0);
  }
}

function toInstitution(row: SqlRow): Institution {
  return {
    id: readString(row, 'id'),
    countryCode: readString(row, 'country_code'),
    name: readString(row, 'name'),
    aliases: AliasesSchema.parse(readJson(row, 'aliases_json')),
    type: readEnum(row, 'institution_type', INSTITUTION_TYPES),
    source: readString(row, 'source'),
  };
}
