import { TadorinoError } from './errors.js';
import { OperationContext, parseResponse } from './http.js';
import { inputObject, noteId, origin, requestOptions, snapshot, timeout } from './validation.js';

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
 */
/**
 * Search summary with original snippet and UTC timestamp.
 * @typedef {object} SearchNoteItem
 * @property {string} note_id Server-generated lowercase UUIDv4.
 * @property {string} title Memo title.
 * @property {string} snippet The first at most 200 Unicode code points of the original body.
 * @property {string} created_at Server-managed UTC RFC 3339 timestamp string.
 */
/**
 * Search results in the service's existing order; no cursor is provided.
 * @typedef {object} SearchNotesResult
 * @property {SearchNoteItem[]} items Owned matches in newest-first service order; empty means no match.
 * @property {boolean} has_more True when more matches exist; narrow the query to inspect them.
 */
/**
 * Complete memo with its original body and ordered references.
 * @typedef {object} GetNoteResult
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
 * @property {number} [timeoutMs] Default whole-operation deadline, 1–300000 ms; default 60000.
 */
/**
 * Operation-specific cancellation and timeout; unknown options are rejected.
 * @typedef {object} RequestOptions
 * @property {AbortSignal} [signal] Caller cancellation; an already aborted signal prevents token acquisition.
 * @property {number} [timeoutMs] Deadline override covering token, request, and body; integer 1–300000 ms.
 */

/**
 * Save, search, and retrieve the authenticated user or registered machine's memos through REST.
 * Authentication and refresh belong to the application. Each call obtains one
 * Access Token and sends one HTTP request; the SDK never retries automatically.
 * Bind each client to one principal. A machine acts as its own memo owner;
 * the consuming backend must authorize its own frontend users and operations.
 */
export class TadorinoClient {
  /** @type {string} */ #baseUrl;
  /** @type {GetAccessToken} */ #getAccessToken;
  /** @type {typeof globalThis.fetch} */ #fetch;
  /** @type {number} */ #timeoutMs;

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
      this.#timeoutMs = Object.hasOwn(raw, 'timeoutMs') ? timeout(raw.timeoutMs) : 60_000;
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
   * @param {'createNote'|'searchNotes'|'getNote'} operation
   * @param {unknown} input
   * @param {RequestOptions|undefined} options
   * @returns {Promise<CreateNoteResult|SearchNotesResult|GetNoteResult>}
   */
  async #execute(operation, input, options) {
    const started = Date.now();
    /** @type {ReturnType<typeof requestOptions>} */ let settings;
    /** @type {string|undefined} */ let body;
    /** @type {string|null} */ let requestedId = null;
    let limit = 10;
    try {
      settings = requestOptions(options, this.#timeoutMs);
      if (settings.signal?.aborted) throw new TadorinoError('aborted', { operation });
      if (operation === 'getNote') requestedId = noteId(input);
      else ({ body, limit } = snapshot(input, operation));
    } catch (error) {
      if (error instanceof TadorinoError) throw error;
      throw new TadorinoError('input', { operation });
    }
    const context = new OperationContext(operation, settings.signal, settings.timeoutMs, started);
    try {
      /** @type {unknown} */ let token;
      try {
        context.checkpoint();
        token = await context.race(this.#getAccessToken({ signal: context.controller.signal }));
      } catch {
        context.checkpoint();
        throw context.error('auth');
      }
      if (typeof token !== 'string' || !token || /\s/.test(token)) throw context.error('auth');
      const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) };
      const path = operation === 'createNote' ? '/v1/notes' : operation === 'searchNotes' ? '/v1/notes/search' : `/v1/notes/${requestedId}`;
      /** @type {Response} */ let response;
      try {
        context.checkpoint();
        const request = this.#fetch(`${this.#baseUrl}${path}`, { method: operation === 'getNote' ? 'GET' : 'POST', headers, body, signal: context.controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
        // Even an injected Fetch that ignores cancellation has its late body cancelled.
        const observed = Promise.resolve(request).then(value => {
          if (context.stopped || settings.signal?.aborted) { try { void value.body?.cancel().catch(() => {}); } catch { /* Safe cleanup only. */ } }
          return value;
        });
        response = await context.race(observed);
      } catch {
        context.checkpoint();
        throw context.error('network');
      }
      try { return await parseResponse(response, context, operation, limit, requestedId); }
      catch (error) {
        context.checkpoint();
        if (error instanceof TadorinoError) throw error;
        // Injected standard Fetch implementations may supply Response subclasses;
        // broken getters must not expose their original exception to callers.
        throw context.error('network');
      }
    } finally { context.close(); }
  }
}
