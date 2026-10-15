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

/** @typedef {import('./lifecycle-types.js').NoteState} NoteState NoteState public contract. */
/** @typedef {import('./lifecycle-types.js').NoteStateFilter} NoteStateFilter NoteStateFilter public contract. */
/** @typedef {import('./lifecycle-types.js').NoteMetadata} NoteMetadata NoteMetadata public contract. */
/** @typedef {import('./lifecycle-types.js').NoteImportOrigin} NoteImportOrigin NoteImportOrigin public contract. */
/** @typedef {import('./lifecycle-types.js').NoteVersionProvenance} NoteVersionProvenance NoteVersionProvenance public contract. */
/** @typedef {import('./lifecycle-types.js').PageInput} PageInput PageInput public contract. */
/** @typedef {import('./lifecycle-types.js').ListNotesInput} ListNotesInput ListNotesInput public contract. */
/** @typedef {import('./lifecycle-types.js').ListNoteVersionsInput} ListNoteVersionsInput ListNoteVersionsInput public contract. */
/** @typedef {import('./lifecycle-types.js').GetNoteVersionInput} GetNoteVersionInput GetNoteVersionInput public contract. */
/** @typedef {import('./lifecycle-types.js').NoteMutationInput} NoteMutationInput NoteMutationInput public contract. */
/** @typedef {import('./lifecycle-types.js').UpdateNoteInput} UpdateNoteInput UpdateNoteInput public contract. */
/** @typedef {import('./lifecycle-types.js').RestoreNoteVersionInput} RestoreNoteVersionInput RestoreNoteVersionInput public contract. */
/** @typedef {import('./lifecycle-types.js').NoteMutationResult} NoteMutationResult NoteMutationResult public contract. */
/** @typedef {import('./lifecycle-types.js').LifecycleNoteResult} LifecycleNoteResult LifecycleNoteResult public contract. */
/** @typedef {import('./lifecycle-types.js').ListNotesResult} ListNotesResult ListNotesResult public contract. */
/** @typedef {import('./lifecycle-types.js').NoteVersionItem} NoteVersionItem NoteVersionItem public contract. */
/** @typedef {import('./lifecycle-types.js').NoteVersionsResult} NoteVersionsResult NoteVersionsResult public contract. */
/** @typedef {import('./lifecycle-types.js').NoteVersionResult} NoteVersionResult NoteVersionResult public contract. */
/** @typedef {import('./lifecycle-types.js').ExportNotesInput} ExportNotesInput ExportNotesInput public contract. */
/** @typedef {import('./lifecycle-types.js').ExportNotesResult} ExportNotesResult ExportNotesResult public contract. */
/** @typedef {import('./lifecycle-types.js').ImportNotesInput} ImportNotesInput ImportNotesInput public contract. */
/** @typedef {import('./lifecycle-types.js').NoteImportPrepared} NoteImportPrepared NoteImportPrepared public contract. */
/** @typedef {import('./lifecycle-types.js').NoteImportCommitted} NoteImportCommitted NoteImportCommitted public contract. */
/** @typedef {import('./lifecycle-types.js').NoteImportResult} NoteImportResult NoteImportResult public contract. */
/** @typedef {import('./lifecycle-types.js').NotePurgeResult} NotePurgeResult Permanent deletion status. */
/** @typedef {import('./lifecycle-types.js').NoteImportSummary} NoteImportSummary NoteImportSummary public contract. */
/** @typedef {import('./lifecycle-types.js').NoteImportMapping} NoteImportMapping NoteImportMapping public contract. */
