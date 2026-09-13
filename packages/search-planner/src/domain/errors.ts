export type SearchErrorCode =
  | 'SEARCH_INTENT_INVALID'
  | 'CAMPAIGN_INVALID'
  | 'CAMPAIGN_NOT_FOUND'
  | 'INVALID_CAMPAIGN_STATE'
  | 'CAMPAIGN_BUSY'
  | 'SOURCE_UNAVAILABLE'
  | 'INSTITUTION_DATA_INVALID'
  | 'JOB_NOT_FOUND'
  | 'INVALID_JOB_STATE'
  | 'MAX_ATTEMPTS_EXCEEDED';

/** Errors raised by search planning, campaigns and the job queue. */
export class SearchError extends Error {
  override readonly name = 'SearchError';

  constructor(
    readonly code: SearchErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
