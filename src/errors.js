/**
 * Classification for safe SDK failures; use these values rather than parsing message text.
 * @typedef {'configuration'|'input'|'auth'|'http'|'network'|'timeout'|'aborted'|'invalid_response'} TadorinoErrorKind Safe failure classification; do not parse message text.
 */
/**
 * The memo operation that failed, or null for constructor configuration.
 * @typedef {'createNote'|'searchNotes'|'getNote'|'listNotes'|'getTrashedNote'|'updateNote'|'archiveNote'|'unarchiveNote'|'trashNote'|'restoreNote'|'listNoteVersions'|'listTrashedNoteVersions'|'getNoteVersion'|'getTrashedNoteVersion'|'restoreNoteVersion'|'exportNotes'|'importNotes'|'getNoteImport'|'cancelNoteImport'|'purgeNote'|'getNotePurge'|null} Operation The failed operation, or null for constructor configuration.
 */
/**
 * Known memo REST error codes; unknown or malformed upstream codes become null.
 * @typedef {'invalid_request'|'invalid_input'|'invalid_token'|'insufficient_scope'|'invalid_host'|'invalid_origin'|'not_found'|'route_not_found'|'method_not_allowed'|'not_acceptable'|'idempotency_conflict'|'request_too_large'|'unsupported_media_type'|'temporarily_unavailable'|'internal_error'|'invalid_cursor'|'revision_conflict'|'state_conflict'|'note_purge_pending'|'note_purged'|'intent_expired'|'export_too_large'|'invalid_archive'|'unsupported_archive_version'|'import_too_large'|'import_in_progress'} RestErrorCode Known REST code; unknown or malformed upstream codes become null.
 */

/** @internal */
export const ERROR_CODES = new Set([
  'invalid_request', 'invalid_input', 'invalid_token', 'insufficient_scope',
  'invalid_host', 'invalid_origin', 'not_found', 'route_not_found',
  'method_not_allowed', 'not_acceptable', 'idempotency_conflict',
  'request_too_large', 'unsupported_media_type', 'temporarily_unavailable', 'internal_error',
  'invalid_cursor', 'revision_conflict', 'state_conflict', 'note_purge_pending', 'note_purged', 'intent_expired', 'export_too_large', 'invalid_archive', 'unsupported_archive_version', 'import_too_large', 'import_in_progress',
]);

/** @type {Record<TadorinoErrorKind, string>} */
const messages = {
  configuration: 'The SDK configuration is invalid.',
  input: 'The memo input or request options are invalid.',
  auth: 'An access token could not be obtained.',
  http: 'The memo service returned an HTTP error.',
  network: 'The memo service could not be reached or its response was interrupted.',
  timeout: 'The memo operation exceeded its deadline.',
  aborted: 'The memo operation was cancelled.',
  invalid_response: 'The memo service returned an invalid response.',
};

/**
 * A safe failure with machine-readable classification and no original exception,
 * token, request input, response body, or URL. Classify failures with kind,
 * status, and errorCode; message is intended for display and may change.
 * ESM and CommonJS constructor identity is not guaranteed when formats are mixed.
 */
export class TadorinoError extends Error {
  /**
   * Create a classified SDK error. Application code normally receives these
   * errors from TadorinoClient rather than constructing them.
   * @param {TadorinoErrorKind} kind Classification.
   * @param {{operation?: Operation, status?: number|null, errorCode?: RestErrorCode|null, requestId?: string|null}} [details] Safe metadata.
   */
  constructor(kind, details = {}) {
    const selected = Object.hasOwn(messages, kind) ? kind : 'configuration';
    super(messages[selected]);
    /** The fixed class name. */
    this.name = 'TadorinoError';
    /** The machine-readable failure classification. @type {TadorinoErrorKind} */
    this.kind = selected;
    /** The operation, or null for configuration errors. @type {Operation} */
    this.operation = ['createNote', 'searchNotes', 'getNote', 'listNotes', 'getTrashedNote', 'updateNote', 'archiveNote', 'unarchiveNote', 'trashNote', 'restoreNote', 'listNoteVersions', 'listTrashedNoteVersions', 'getNoteVersion', 'getTrashedNoteVersion', 'restoreNoteVersion', 'exportNotes', 'importNotes', 'getNoteImport', 'cancelNoteImport', 'purgeNote', 'getNotePurge'].includes(details.operation ?? '') ? details.operation ?? null : null;
    /** The received HTTP status, or null before a response. @type {number|null} */
    this.status = Number.isInteger(details.status) && Number(details.status) >= 100 && Number(details.status) <= 599 ? Number(details.status) : null;
    /** A validated memo REST error code, or null. @type {RestErrorCode|null} */
    this.errorCode = details.errorCode && ERROR_CODES.has(details.errorCode) ? details.errorCode : null;
    /** A safe UUID from X-Request-ID, or null when unavailable. @type {string|null} */
    this.requestId = safeRequestId(details.requestId);
  }
}

/** @internal @param {unknown} value @returns {string|null} */
export function safeRequestId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
