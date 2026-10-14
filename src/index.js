export { TadorinoClient } from './client.js';
export { TadorinoError } from './errors.js';

/** @typedef {import('./client.js').Source} Source Memo reference. */
/** @typedef {import('./client.js').CreateNoteInput} CreateNoteInput Save input. */
/** @typedef {import('./client.js').CreateNoteResult} CreateNoteResult Save confirmation. */
/** @typedef {import('./client.js').SearchNotesInput} SearchNotesInput Search input. */
/** @typedef {import('./client.js').SearchNoteItem} SearchNoteItem Search summary. */
/** @typedef {import('./client.js').SearchNotesResult} SearchNotesResult Search result. */
/** @typedef {import('./client.js').GetNoteResult} GetNoteResult Complete memo. */
/** @typedef {import('./client.js').TokenContext} TokenContext Per-operation cancellation. */
/** @typedef {import('./client.js').GetAccessToken} GetAccessToken Application-owned token callback. */
/** @typedef {import('./client.js').ClientOptions} ClientOptions SDK configuration. */
/** @typedef {import('./client.js').RequestOptions} RequestOptions Operation options. */
/** @typedef {import('./errors.js').TadorinoErrorKind} TadorinoErrorKind Failure classification. */
/** @typedef {import('./errors.js').Operation} Operation Memo operation. */
/** @typedef {import('./errors.js').RestErrorCode} RestErrorCode Known REST error code. */
