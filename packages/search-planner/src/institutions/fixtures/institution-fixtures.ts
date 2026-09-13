import {
  createInstitutionId,
  type Institution,
  type InstitutionType,
} from '../../domain/institution.js';

export const STATIC_FIXTURE_SOURCE = 'static-fixture';

const fixture = (
  countryCode: string,
  name: string,
  type: InstitutionType,
  aliases: readonly string[] = [],
): Institution => ({
  id: createInstitutionId(countryCode, name),
  countryCode,
  name,
  aliases,
  type,
  source: STATIC_FIXTURE_SOURCE,
});

/**
 * A SMALL representative development dataset: a handful of institutions for
 * five countries. It is not a registry; real institution import comes later.
 */
export const INSTITUTION_FIXTURES: readonly Institution[] = [
  fixture('CA', 'University of Toronto', 'UNIVERSITY', ['U of T', 'UofT']),
  fixture('CA', 'McGill University', 'UNIVERSITY'),
  fixture('CA', 'University of British Columbia', 'UNIVERSITY', ['UBC']),
  fixture('CA', 'Humber College', 'COLLEGE'),
  fixture('CA', 'British Columbia Institute of Technology', 'INSTITUTE', ['BCIT']),

  fixture('US', 'Harvard University', 'UNIVERSITY'),
  fixture('US', 'University of California, Berkeley', 'UNIVERSITY', ['UC Berkeley']),
  fixture('US', 'Ohio State University', 'UNIVERSITY'),
  fixture('US', 'Miami Dade College', 'COLLEGE'),
  fixture('US', 'Massachusetts Institute of Technology', 'INSTITUTE', ['MIT']),

  fixture('GB', 'University of Oxford', 'UNIVERSITY'),
  fixture('GB', 'University of Manchester', 'UNIVERSITY'),
  fixture('GB', "King's College London", 'UNIVERSITY', ['KCL']),
  fixture('GB', 'Imperial College London', 'UNIVERSITY'),

  fixture('NG', 'University of Lagos', 'UNIVERSITY', ['UNILAG']),
  fixture('NG', 'University of Ibadan', 'UNIVERSITY'),
  fixture('NG', 'Obafemi Awolowo University', 'UNIVERSITY', ['OAU']),
  fixture('NG', 'Yaba College of Technology', 'POLYTECHNIC', ['YABATECH']),

  fixture('AU', 'University of Melbourne', 'UNIVERSITY'),
  fixture('AU', 'University of Sydney', 'UNIVERSITY'),
  fixture('AU', 'Monash University', 'UNIVERSITY'),
  fixture('AU', 'TAFE NSW', 'COLLEGE'),
];
