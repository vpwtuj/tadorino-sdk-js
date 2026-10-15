import { TadorinoError } from './errors.js';
import { OperationContext, parseResponse } from './http.js';
import { inputObject, origin, requestOptions, timeout } from './validation.js';
import { requestPlan } from './lifecycle-validation.js';
import { exportStream, validateArchive, uploadBody } from './archive-streams.js';

/**
 * A preserved reference attached to a memo; supply at least one field.
 * @typedef {object} Source
 * @property {string} [title] Original reference title, at most 300 Unicode code points.
 * @property {string} [url] Original absolute HTTP(S) URL, at most 2048 Unicode code points.
 * @property {string} [excerpt] Original reference excerpt, at most 1000 Unicode code points.
 */
/**
 * A save operation; retain its key and original content for uncertain retries.
 * @typedef {object} CreateNoteInput
 * @property {string} title Memo title; the server trims and validates its 1–200 code points.
 * @property {string} body Original nonblank Markdown, at most 20000 Unicode code points.
 * @property {string} idempotency_key Caller-generated UUID for this one save operation.
 * @property {Source[]} [sources] Ordered original references, at most 20; omitted means none.
 */
/**
 * Save confirmation; a replay has created false and the original ID and timestamp.
 * @typedef {object} CreateNoteResult
 * @property {string} note_id Server-generated lowercase UUIDv4.
 * @property {string} title Validated title returned by the server.
 * @property {string} created_at Server-managed UTC RFC 3339 timestamp string.
 * @property {boolean} created True for a new save (201); false for a replay (200).
 */
/**
 * AND search input; the service owns search normalization and matching.
 * @typedef {object} SearchNotesInput
 * @property {string} query Search terms; at most 200 Unicode code points before normalization.
 * @property {number} [limit] Integer from 1 to 20, default 10.
 * @property {import('./lifecycle-types.js').NoteStateFilter} [state] Default active.
 * @property {string} [cursor] Opaque continuation cursor for the same conditions.
 */
/**
 * Search summary with original snippet and UTC timestamp.
 * @typedef {object} SearchNoteItem
 * @property {import('./lifecycle-types.js').NoteState} [state] Current lifecycle state, if supported by the server.
 * @property {number} [revision] Current optimistic concurrency revision.
 * @property {number} [content_version] Current content version.
 * @property {string} [updated_at] Last content update UTC time.
 * @property {string} [state_changed_at] Last state change UTC time.
 * @property {string} [trashed_at] Trash entry UTC time.
 * @property {'active'|'archived'} [restore_state] State before trash.
 * @property {string} note_id Server-generated lowercase UUIDv4.
 * @property {string} title Memo title.
 * @property {string} snippet The first at most 200 Unicode code points of the original body.
 * @property {string} created_at Server-managed UTC RFC 3339 timestamp string.
 */
/**
 * Search results in the service's existing order, with optional lifecycle pagination.
 * @typedef {object} SearchNotesResult
 * @property {SearchNoteItem[]} items Owned matches in newest-first service order; empty means no match.
 * @property {boolean} has_more True when more matches exist.
 * @property {string|null} [next_cursor] Continuation cursor on lifecycle-enabled servers.
 */
/**
 * Complete memo with its original body and ordered references.
 * @typedef {object} GetNoteResult
 * @property {import('./lifecycle-types.js').NoteState} [state] Current lifecycle state, if supported by the server.
 * @property {number} [revision] Current optimistic concurrency revision.
 * @property {number} [content_version] Current content version.
 * @property {string} [updated_at] Last content update UTC time.
 * @property {string} [state_changed_at] Last state change UTC time.
 * @property {string} [trashed_at] Trash entry UTC time.
 * @property {'active'|'archived'} [restore_state] State before trash.
 * @property {import('./lifecycle-types.js').NoteImportOrigin} [import_origin] Latest copy provenance.
 * @property {import('./lifecycle-types.js').NoteImportOrigin[]} [prior_provenance] Earlier copy provenance.
 * @property {string} note_id Server-generated lowercase UUIDv4 matching the requested memo.
 * @property {string} title Memo title.
 * @property {string} body Original Markdown including whitespace and Unicode representation.
 * @property {Source[]} sources Original references in their original order.
 * @property {string} created_at Server-managed UTC RFC 3339 timestamp string.
 */
/**
 * The operation's signal includes caller cancellation and the SDK deadline.
 * @typedef {object} TokenContext
 * @property {AbortSignal} signal Cancellation notification for application token acquisition.
 */
/**
 * Obtain one user or registered machine's Access Token once per operation. The application
 * owns refresh, caching, session isolation, and login; late results after SDK
 * cancellation do not start an HTTP request.
 * @typedef {(context: TokenContext) => string|Promise<string>} GetAccessToken Obtain one principal's Access Token; authentication and renewal belong to the application.
 */
/**
 * Shared browser/Node.js SDK configuration; authentication is application-owned.
 * @typedef {object} ClientOptions
 * @property {string} baseUrl HTTPS service origin only; explicit HTTP loopback is allowed for local tests.
 * @property {GetAccessToken} getAccessToken Callback bound to one user session or registered machine, called once per operation.
 * @property {typeof globalThis.fetch} [fetch] Standard Fetch implementation; defaults to globalThis.fetch.
 * @property {number} [timeoutMs] Explicit default deadline, 1–300000 ms; omission uses 60000 for JSON and 120000 for export/import.
 */
/**
 * Operation-specific cancellation and timeout; unknown options are rejected.
 * @typedef {object} RequestOptions
 * @property {AbortSignal} [signal] Caller cancellation; an already aborted signal prevents token acquisition.
 * @property {number} [timeoutMs] Deadline override covering token, request, and body; integer 1–300000 ms.
 */

/**
 * Manage the authenticated user or registered machine's memos through REST.
 * Authentication and refresh belong to the application. Each call obtains one
 * Access Token. Import sends preparation and upload under one deadline; the SDK never retries automatically.
 * Bind each client to one principal. A machine acts as its own memo owner;
 * the consuming backend must authorize its own frontend users and operations.
 */
export class TadorinoClient {
  /** @type {string} */ #baseUrl;
  /** @type {GetAccessToken} */ #getAccessToken;
  /** @type {typeof globalThis.fetch} */ #fetch;
  /** @type {number|undefined} */ #timeoutMs;

  /**
   * Configure a shared browser/Node.js memo client.
   * @param {ClientOptions} options HTTPS service origin, token callback, optional Fetch and default deadline.
   * @throws {TadorinoError} With kind configuration for invalid settings.
   */
  constructor(options) {
    try {
      const raw = inputObject(options, ['baseUrl', 'getAccessToken', 'fetch', 'timeoutMs'], ['baseUrl', 'getAccessToken']);
      this.#baseUrl = origin(raw.baseUrl);
      if (typeof raw.getAccessToken !== 'function') throw new Error('callback');
      this.#getAccessToken = /** @type {GetAccessToken} */ (raw.getAccessToken);
      const fetchImpl = Object.hasOwn(raw, 'fetch') ? raw.fetch : globalThis.fetch;
      if (typeof fetchImpl !== 'function') throw new Error('fetch');
      this.#fetch = /** @type {typeof globalThis.fetch} */ (Object.hasOwn(raw, 'fetch') ? fetchImpl : fetchImpl.bind(globalThis));
      this.#timeoutMs = Object.hasOwn(raw, 'timeoutMs') ? timeout(raw.timeoutMs) : undefined;
    } catch { throw new TadorinoError('configuration'); }
  }

  /**
   * Save original Markdown and references. An application supplies a UUID
   * idempotency_key and preserves the same key and input when a result is unknown.
   * @param {CreateNoteInput} input Memo content and caller-owned retry key.
   * @param {RequestOptions} [options] Cancellation and deadline override.
   * @returns {Promise<CreateNoteResult>} New or replayed save confirmation.
   * @throws {TadorinoError} Safe classified failure. Timeout does not prove a save failed.
   */
  async createNote(input, options) {
    return /** @type {Promise<CreateNoteResult>} */ (this.#execute('createNote', input, options));
  }

  /**
   * Search the current principal's title/body, preserving the server's order.
   * @param {SearchNotesInput} input Search terms and optional result limit.
   * @param {RequestOptions} [options] Cancellation and deadline override.
   * @returns {Promise<SearchNotesResult>} Matches, including an empty successful result.
   * @throws {TadorinoError} Safe classified failure; failures never become empty results.
   */
  async searchNotes(input, options) {
    return /** @type {Promise<SearchNotesResult>} */ (this.#execute('searchNotes', input, options));
  }

  /**
   * Retrieve an owned memo's complete original text and ordered references.
   * @param {string} id UUIDv4; uppercase is accepted and lowercased in the path.
   * @param {RequestOptions} [options] Cancellation and deadline override.
   * @returns {Promise<GetNoteResult>} Complete memo with a UTC timestamp string.
   * @throws {TadorinoError} Safe classified failure, including HTTP 404 for unavailable memos.
   */
  async getNote(id, options) {
    return /** @type {Promise<GetNoteResult>} */ (this.#execute('getNote', id, options));
  }

  /**
   * List owned memos in server order.
   * @param {import('./lifecycle-types.js').ListNotesInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').ListNotesResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async listNotes(input, options) { return /** @type {Promise<import('./lifecycle-types.js').ListNotesResult>} */(this.#execute('listNotes', input, options)); }

  /**
   * Read a memo explicitly from trash.
   * @param {string} input UUIDv4 resource identifier.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').LifecycleNoteResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async getTrashedNote(input, options) { return /** @type {Promise<import('./lifecycle-types.js').LifecycleNoteResult>} */(this.#execute('getTrashedNote', input, options)); }

  /**
   * Edit selected fields; preserve the original key and input for uncertain retries.
   * @param {import('./lifecycle-types.js').UpdateNoteInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteMutationResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async updateNote(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteMutationResult>} */(this.#execute('updateNote', input, options)); }

  /**
   * Archive a memo; content remains editable.
   * @param {import('./lifecycle-types.js').NoteMutationInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteMutationResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async archiveNote(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteMutationResult>} */(this.#execute('archiveNote', input, options)); }

  /**
   * Return an archived memo to the active state.
   * @param {import('./lifecycle-types.js').NoteMutationInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteMutationResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async unarchiveNote(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteMutationResult>} */(this.#execute('unarchiveNote', input, options)); }

  /**
   * Move a memo to trash without deleting history.
   * @param {import('./lifecycle-types.js').NoteMutationInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteMutationResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async trashNote(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteMutationResult>} */(this.#execute('trashNote', input, options)); }

  /**
   * Restore a trashed memo to its prior state.
   * @param {import('./lifecycle-types.js').NoteMutationInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteMutationResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async restoreNote(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteMutationResult>} */(this.#execute('restoreNote', input, options)); }

  /**
   * List a memo’s content history.
   * @param {import('./lifecycle-types.js').ListNoteVersionsInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteVersionsResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async listNoteVersions(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteVersionsResult>} */(this.#execute('listNoteVersions', input, options)); }

  /**
   * List history explicitly for a trashed memo.
   * @param {import('./lifecycle-types.js').ListNoteVersionsInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteVersionsResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async listTrashedNoteVersions(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteVersionsResult>} */(this.#execute('listTrashedNoteVersions', input, options)); }

  /**
   * Read one original content version.
   * @param {import('./lifecycle-types.js').GetNoteVersionInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteVersionResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async getNoteVersion(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteVersionResult>} */(this.#execute('getNoteVersion', input, options)); }

  /**
   * Read one content version explicitly from trash.
   * @param {import('./lifecycle-types.js').GetNoteVersionInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteVersionResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async getTrashedNoteVersion(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteVersionResult>} */(this.#execute('getTrashedNoteVersion', input, options)); }

  /**
   * Append a past content version as a new version.
   * @param {import('./lifecycle-types.js').RestoreNoteVersionInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteMutationResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async restoreNoteVersion(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteMutationResult>} */(this.#execute('restoreNoteVersion', input, options)); }

  /**
   * Export a ZIP stream. Keep reading to EOF before reporting success; the deadline remains active after headers.
   * @param {import('./lifecycle-types.js').ExportNotesInput} input Strict operation input; unknown fields are rejected.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').ExportNotesResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async exportNotes(input, options) { return /** @type {Promise<import('./lifecycle-types.js').ExportNotesResult>} */(this.#execute('exportNotes', input, options)); }

  /**
   * Inspect a prior import without resubmitting the ZIP.
   * @param {string} input UUIDv4 resource identifier.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteImportResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async getNoteImport(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteImportResult>} */(this.#execute('getNoteImport', input, options)); }

  /**
   * Cancel an unfinished import and its temporary resources.
   * @param {string} input UUIDv4 resource identifier.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteImportResult>} Validated result with unknown fields removed.
   * @throws {TadorinoError} Classified failure; uncertain mutations must reuse their original key.
   */
  async cancelNoteImport(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteImportResult>} */(this.#execute('cancelNoteImport', input, options)); }

  /**
   * Prepare and upload one ZIP using one token and one 120-second default deadline.
   * Even a committed preparation is uploaded again to verify logical content equality.
   * @param {import('./lifecycle-types.js').ImportNotesInput} input ZIP source and caller-owned retry key.
   * @param {RequestOptions} [options] Cancellation and whole-operation deadline.
   * @returns {Promise<import('./lifecycle-types.js').NoteImportCommitted>} Committed copy receipt.
   * @throws {TadorinoError} Classified failure. Reopen a stream for an explicit retry.
   */
  async importNotes(input, options) { return /** @type {Promise<import('./lifecycle-types.js').NoteImportCommitted>} */(this.#execute('importNotes', input, options)); }

  /**
   * Request permanent deletion of an owned trashed memo with explicit purge permission.
   * No automatic polling occurs; pending does not mean deletion has completed.
   * @param {import('./lifecycle-types.js').NoteMutationInput} input Memo, expected revision, and original retry key.
   * @param {RequestOptions} [options] Cancellation and deadline.
   * @returns {Promise<import('./lifecycle-types.js').NotePurgeResult>} Pending or completed deletion.
   * @throws {TadorinoError} Safe classified failure.
   */
  async purgeNote(input,options) { return /** @type {Promise<import('./lifecycle-types.js').NotePurgeResult>} */(this.#execute('purgeNote',input,options)); }

  /**
   * Inspect deletion status under the same current permission checks.
   * @param {string} id Purge UUIDv4.
   * @param {RequestOptions} [options] Cancellation and deadline.
   * @returns {Promise<import('./lifecycle-types.js').NotePurgeResult>} Pending or completed deletion.
   * @throws {TadorinoError} Safe classified failure.
   */
  async getNotePurge(id,options) { return /** @type {Promise<import('./lifecycle-types.js').NotePurgeResult>} */(this.#execute('getNotePurge',id,options)); }

  /** @param {import('./errors.js').Operation} operation @param {unknown} input @param {RequestOptions|undefined} options @returns {Promise<unknown>} */
  async #execute(operation, input, options) {
    const started = Date.now();
    /** @type {ReturnType<typeof requestOptions>} */ let settings;
    /** @type {import('./lifecycle-validation.js').RequestPlan} */ let plan;
    /** @type {Blob|Uint8Array|ReadableStream<Uint8Array>|undefined} */ let archive;
    try {
      settings = requestOptions(options, this.#timeoutMs ?? (operation === 'importNotes' || operation === 'exportNotes' ? 120_000 : 60_000));
      if (settings.signal?.aborted) throw new TadorinoError('aborted', {operation});
      if (operation === 'importNotes') {
        const raw = inputObject(input,['archive','idempotency_key','source_note_ids'],['archive','idempotency_key']);
        archive = validateArchive(raw.archive);
        input = {idempotency_key:raw.idempotency_key,...(Object.hasOwn(raw,'source_note_ids') ? {source_note_ids:raw.source_note_ids} : {})};
      }
      plan = requestPlan(operation,input);
    } catch(error) { if (error instanceof TadorinoError) throw error; throw new TadorinoError('input',{operation}); }
    const context = new OperationContext(operation,settings.signal,settings.timeoutMs,started);
    let streaming = false;
    /** @type {ReturnType<typeof uploadBody>|undefined} */ let upload;
    try {
      /** @type {unknown} */ let token;
      try { context.checkpoint(); token = await context.race(this.#getAccessToken({signal:context.controller.signal})); }
      catch { context.checkpoint(); throw context.error('auth'); }
      if (typeof token !== 'string' || !token || /\s/.test(token)) throw context.error('auth');
      const auth = token;
      /** @param {import('./lifecycle-validation.js').RequestPlan} request @param {BodyInit|undefined} [body] @param {'half'|undefined} [duplex] @returns {Promise<Response>} */
      const send = async (request,body,duplex) => {
        try {
          context.checkpoint();
          const binary = body !== undefined;
          const headers = {Accept:operation === 'exportNotes' ? 'application/zip' : 'application/json',Authorization:`Bearer ${auth}`,...(binary || request.body !== undefined ? {'Content-Type':binary ? 'application/zip' : 'application/json'} : {})};
          const pending = this.#fetch(`${this.#baseUrl}${request.path}`,{method:request.method,headers,body:binary ? body : request.body,...(duplex ? {duplex} : {}),signal:context.controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
          const observed = Promise.resolve(pending).then(value=>{ if (context.stopped || context.controller.signal.aborted || settings.signal?.aborted) {try {void value.body?.cancel().catch(()=>{});} catch {/* Safe cleanup. */}} return value; });
          return await context.race(observed);
        } catch(error) { context.checkpoint(); if (error instanceof TadorinoError) throw error; throw context.error('network'); }
      };
      const response = await send(plan);
      if (operation === 'exportNotes') { const result = await exportStream(response,context,plan); streaming=true; return result; }
      const result = await parseResponse(response,context,operation,plan,operation === 'createNote' || operation === 'importNotes' ? [200,201] : operation === 'purgeNote' || operation === 'getNotePurge' ? [200,202] : [200]);
      if (operation !== 'importNotes') return result;
      const importId = /** @type {import('./lifecycle-types.js').NoteImportResult} */(result).import_id;
      const next = {...plan,path:`/v1/note-imports/${importId}/archive`,method:'PUT',body:undefined,id:importId};
      upload = uploadBody(/** @type {Blob|Uint8Array|ReadableStream<Uint8Array>} */(archive),context);
      const committed = await parseResponse(await send(next,upload.body,upload.duplex),context,operation,next,[200]);
      if (!committed || typeof committed !== 'object' || !Object.hasOwn(committed,'mappings')) throw context.error('invalid_response');
      return committed;
    } catch(error) { context.checkpoint(); if (error instanceof TadorinoError) throw error; throw context.error('network'); }
    finally { upload?.cancel(); if (!streaming) context.close(); }
  }
}
