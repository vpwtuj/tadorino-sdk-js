/** @typedef {'active'|'archived'|'trashed'} NoteState Current memo state. */
/** @typedef {NoteState|'active_and_archived'} NoteStateFilter Search selection. */
/**
 * Current lifecycle metadata. Trash fields exist only while trashed.
 * @typedef {object} NoteMetadata
 * @property {NoteState} state Current state.
 * @property {number} revision Positive revision for optimistic concurrency.
 * @property {number} content_version Positive content version.
 * @property {string} updated_at Last content change, UTC.
 * @property {string} state_changed_at Last state change, UTC.
 * @property {string} [trashed_at] Trash entry time, UTC.
 * @property {'active'|'archived'} [restore_state] State before trash.
 */
/**
 * Original timestamps retained by a copy import.
 * @typedef {object} NoteImportOrigin
 * @property {string} source_note_id Original memo UUID.
 * @property {string} source_created_at Original creation UTC time.
 * @property {string} source_updated_at Original update UTC time.
 * @property {string} source_state_changed_at Original state change UTC time.
 * @property {string} imported_at Copy import UTC time.
 * @property {string} [source_trashed_at] Original trash UTC time.
 */
/**
 * Content version provenance.
 * @typedef {object} NoteVersionProvenance
 * @property {string} source_note_id Original memo UUID.
 * @property {number} source_content_version Original content version.
 * @property {string} source_recorded_at Original record UTC time.
 * @property {'create'|'update'|'restore'|'import'} source_operation Original action.
 * @property {string} imported_at Import UTC time.
 * @property {number} [source_restored_from_version] Original restore target.
 */
/**
 * Page selection, in server order. Cursors are opaque and tied to the conditions.
 * @typedef {object} PageInput
 * @property {number} [limit] Integer 1–20; default 10.
 * @property {string} [cursor] Cursor returned by the previous page.
 */
/**
 * Page and state selection; default active.
 * @typedef {object} ListNotesInput
 * @property {number} [limit] Integer 1–20; default 10.
 * @property {string} [cursor] Opaque continuation cursor bound to the same conditions.
 * @property {NoteStateFilter} [state] State selection; default active.
 */
/**
 * Owned memo and history page.
 * @typedef {object} ListNoteVersionsInput
 * @property {string} note_id Owned memo UUIDv4.
 * @property {number} [limit] Integer 1–20; default 10.
 * @property {string} [cursor] Opaque continuation cursor bound to the same conditions.
 */
/**
 * Owned memo and positive content version.
 * @typedef {object} GetNoteVersionInput
 * @property {string} note_id Owned memo UUIDv4.
 * @property {number} version Positive safe integer content version.
 */
/**
 * Original operation input retained for uncertain retries.
 * @typedef {object} NoteMutationInput
 * @property {string} note_id Owned memo UUIDv4.
 * @property {number} expected_revision Current positive revision; conflicts require reading the latest memo.
 * @property {string} idempotency_key Caller-owned UUIDv4; preserve it with the exact original input for retries.
 */
/**
 * At least one content field; omitted fields are preserved.
 * @typedef {object} UpdateNoteInput
 * @property {string} note_id Owned memo UUIDv4.
 * @property {number} expected_revision Current positive revision; conflicts require reading the latest memo.
 * @property {string} idempotency_key Caller-owned UUIDv4; preserve it with the exact original input for retries.
 * @property {string} [title] Replacement title.
 * @property {string} [body] Replacement original Markdown.
 * @property {import('./client.js').Source[]} [sources] Replacement ordered references; empty array clears references.
 */
/**
 * Append a past content version as a new version.
 * @typedef {object} RestoreNoteVersionInput
 * @property {string} note_id Owned memo UUIDv4.
 * @property {number} expected_revision Current positive revision; conflicts require reading the latest memo.
 * @property {string} idempotency_key Caller-owned UUIDv4; preserve it with the exact original input for retries.
 * @property {number} version Positive content version to restore.
 */
/**
 * Frozen receipt; no memo body.
 * @typedef {object} NoteMutationResult
 * @property {string} note_id Owned memo UUIDv4.
 * @property {NoteState} state State at operation completion.
 * @property {number} revision Positive concurrency revision.
 * @property {number} content_version Positive content version.
 * @property {string} updated_at Last content update UTC time.
 * @property {string} state_changed_at Last state change UTC time.
 * @property {string} [trashed_at] Trash entry UTC time; only present in trash.
 * @property {'active'|'archived'} [restore_state] Prior state; only present in trash.
 * @property {boolean} changed Whether the original operation changed the memo.
 * @property {boolean} replayed Whether this request reused the original successful receipt.
 */
/** @typedef {NoteMetadata & import('./client.js').GetNoteResult} LifecycleNoteResult Complete memo with lifecycle metadata. */
/**
 * Memo summaries in server order.
 * @typedef {object} ListNotesResult
 * @property {(import('./client.js').SearchNoteItem & NoteMetadata)[]} items Matching memo summaries.
 * @property {boolean} has_more True if another page exists.
 * @property {string|null} next_cursor Continuation cursor or null on the last page.
 */
/**
 * A content history entry.
 * @typedef {object} NoteVersionItem
 * @property {number} content_version Content version number.
 * @property {string} recorded_at UTC record time.
 * @property {'create'|'update'|'restore'|'import'} source Action creating this version.
 * @property {number} [restored_from_version] Present for a restore entry.
 * @property {NoteImportSummary} [import_summary] Present for an import entry.
 */
/**
 * Content history in descending version order.
 * @typedef {object} NoteVersionsResult
 * @property {string} note_id Owned memo UUIDv4.
 * @property {number} current_revision Current positive revision.
 * @property {number} current_content_version Current positive content version.
 * @property {NoteVersionItem[]} items Selected history entries.
 * @property {boolean} has_more True if another page exists.
 * @property {string|null} next_cursor Continuation cursor or null on the last page.
 */
/**
 * Complete original content of one version.
 * @typedef {object} NoteVersionResult
 * @property {string} note_id Owned memo UUIDv4.
 * @property {string} title Memo title.
 * @property {string} body Original Markdown, preserving whitespace and Unicode.
 * @property {import('./client.js').Source[]} sources Original references in order.
 * @property {number} content_version Positive content version.
 * @property {string} recorded_at UTC record time.
 * @property {'create'|'update'|'restore'|'import'} source Action that created this version.
 * @property {number} [restored_from_version] Restore target; present only for restore.
 * @property {NoteVersionProvenance} [provenance] Original record; required for import.
 * @property {NoteVersionProvenance[]} [prior_provenance] Earlier copy provenance, when present.
 */
/**
 * Default active and archived latest versions; optional history and explicit IDs.
 * @typedef {object} ExportNotesInput
 * @property {NoteState[]} [states] Nonempty unique state selection.
 * @property {boolean} [include_history] Include all content versions; default false.
 * @property {string[]} [note_ids] Nonempty unique UUIDv4 selection, at most 1000; omission means all matching memos.
 */
/**
 * ZIP stream; success requires reading to EOF and closing the destination successfully.
 * @typedef {object} ExportNotesResult
 * @property {ReadableStream<Uint8Array>} stream Bounded ZIP stream, with its deadline still active.
 * @property {'application/zip'} content_type Validated media type.
 * @property {'tadorino-export.zip'} filename Fixed safe download filename.
 */
/**
 * ZIP bytes and stable retry key. Reopen streams for explicit retries.
 * @typedef {object} ImportNotesInput
 * @property {Blob|Uint8Array|ReadableStream<Uint8Array>} archive Complete ZIP input; File extends Blob. Stream support depends on Fetch.
 * @property {string} idempotency_key Caller-owned UUIDv4 shared by preparation and upload.
 * @property {string[]} [source_note_ids] Nonempty unique source UUIDv4 selection, at most 1000; omission means all ZIP memos.
 */
/**
 * Preparation or pending import status.
 * @typedef {object} NoteImportPrepared
 * @property {string} import_id Import UUIDv4.
 * @property {'awaiting_upload'|'uploading'|'cancelled'|'expired'} status Current uncommitted state; a committed preparation returns a full receipt.
 * @property {string} expires_at UTC session expiry.
 */
/**
 * Committed copy receipt; destination IDs are newly generated.
 * @typedef {object} NoteImportCommitted
 * @property {string} import_id Import UUIDv4.
 * @property {'committed'} status Transaction committed.
 * @property {string} imported_at Import UTC time.
 * @property {number} imported_notes Number of copied memos.
 * @property {number} imported_versions Number of copied content versions.
 * @property {NoteImportMapping[]} mappings Source-to-copy mapping in service order.
 * @property {boolean} replayed Whether the original committed receipt was reused.
 */
/** @typedef {NoteImportPrepared|NoteImportCommitted} NoteImportResult Import status or committed receipt. */

/**
 * Accepted deletion status. Pending does not mean content is deleted.
 * @typedef {object} NotePurgeResult
 * @property {string} purge_id Deletion operation UUIDv4.
 * @property {string} note_id Owned target memo UUIDv4.
 * @property {'pending'|'completed'} status Deletion state; no automatic polling.
 * @property {string} requested_at UTC request time.
 * @property {string} [completed_at] Required UTC completion time only when completed.
 */

/**
 * Small history provenance summary.
 * @typedef {object} NoteImportSummary
 * @property {string} source_note_id Original memo UUIDv4.
 * @property {number} source_content_version Original content version.
 */
/**
 * One source-to-copy mapping.
 * @typedef {object} NoteImportMapping
 * @property {string} source_note_id Original memo UUIDv4.
 * @property {string} note_id New owned memo UUIDv4.
 * @property {number} content_version Copied logical content version count.
 */
