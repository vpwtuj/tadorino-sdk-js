import { ERROR_CODES, TadorinoError, safeRequestId } from './errors.js';
import { projectResult } from './validation.js';

/** @internal */
export const RESPONSE_LIMIT = 1024 * 1024;
/** @typedef {import('./errors.js').Operation} Operation */

/** @internal */
export class OperationContext {
  /** @param {Operation} operation @param {AbortSignal|undefined} external @param {number} timeoutMs @param {number} started */
  constructor(operation, external, timeoutMs, started) {
    this.operation = operation;
    this.external = external;
    this.deadline = started + timeoutMs;
    this.controller = new AbortController();
    /** @type {number|null} */ this.status = null;
    /** @type {string|null} */ this.requestId = null;
    /** @type {'timeout'|'aborted'|null} */ this.stopped = null;
    /** @type {ReadableStreamDefaultReader<Uint8Array>|null} */ this.reader = null;
    /** @type {(reason: TadorinoError) => void} */ let stopReject = () => {};
    /** @type {Promise<never>} */ this.interrupted = new Promise((_, reject) => { stopReject = reject; });
    this.reject = stopReject;
    // The rejection can happen before the first awaited operation.
    void this.interrupted.catch(() => {});
    this.onAbort = () => this.stop('aborted');
    external?.addEventListener('abort', this.onAbort, { once: true });
    this.timer = setTimeout(() => this.stop('timeout'), Math.max(0, this.deadline - Date.now()));
    if (external?.aborted) this.stop('aborted');
  }

  /** @param {import('./errors.js').TadorinoErrorKind} kind @param {import('./errors.js').RestErrorCode|null} [errorCode] @returns {TadorinoError} */
  error(kind, errorCode = null) {
    return new TadorinoError(kind, { operation: this.operation, status: this.status, requestId: this.requestId, errorCode });
  }

  /** @param {'timeout'|'aborted'} kind */
  stop(kind) {
    if (this.stopped) return;
    this.stopped = this.external?.aborted ? 'aborted' : kind;
    this.controller.abort();
    this.cancelReader();
    this.reject(this.error(this.stopped));
  }

  checkpoint() {
    if (this.external?.aborted) throw this.error('aborted');
    if (!this.stopped && Date.now() >= this.deadline) this.stop('timeout');
    if (this.stopped) throw this.error(this.stopped);
  }

  /** @template T @param {PromiseLike<T>|T} work @returns {Promise<T>} */
  async race(work) {
    this.checkpoint();
    const result = await Promise.race([Promise.resolve(work), this.interrupted]);
    this.checkpoint();
    return result;
  }

  cancelReader() {
    if (this.reader) {
      try { void this.reader.cancel().catch(() => {}); } catch { /* Cancellation must not replace the classified failure. */ }
    }
  }

  close() {
    clearTimeout(this.timer);
    this.external?.removeEventListener('abort', this.onAbort);
    if (this.reader) {
      try { this.reader.releaseLock(); } catch { /* A pending read releases after cancellation settles. */ }
      this.reader = null;
    }
  }
}

/** @param {Response} response @param {OperationContext} context @returns {Promise<{text: string, overflow: boolean}>} */
async function boundedBody(response, context) {
  if (!response.body) return { text: '', overflow: false };
  /** @type {ReadableStreamDefaultReader<Uint8Array>} */ let reader;
  try { reader = response.body.getReader(); }
  catch { throw context.error('network'); }
  context.reader = reader;
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await context.race(reader.read());
      if (done) break;
      if (!(value instanceof Uint8Array)) throw context.error('network');
      length += value.byteLength;
      if (length > RESPONSE_LIMIT) {
        context.cancelReader();
        return { text: '', overflow: true };
      }
      // Empty chunks are legal but must not allocate an unbounded list while
      // the byte count stays at zero. Each read still observes the deadline.
      if (value.byteLength > 0) chunks.push(value);
    }
    context.checkpoint();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), overflow: false }; }
    catch { return { text: '', overflow: false }; }
  } catch {
    context.checkpoint();
    context.cancelReader();
    throw context.error('network');
  } finally {
    try { reader.releaseLock(); } catch { /* Pending cancellation is handled by close(). */ }
    context.reader = null;
  }
}

/**
 * @internal
 * @param {Response} response
 * @param {OperationContext} context
 * @param {'createNote'|'searchNotes'|'getNote'} operation
 * @param {number} limit
 * @param {string|null} requestedId
 * @returns {Promise<import('./client.js').CreateNoteResult|import('./client.js').SearchNotesResult|import('./client.js').GetNoteResult>}
 */
export async function parseResponse(response, context, operation, limit, requestedId) {
  if (!(response instanceof Response) || response.status < 100) throw context.error('network');
  context.status = response.status;
  context.requestId = safeRequestId(response.headers.get('X-Request-ID'));
  const success = response.status >= 200 && response.status < 300;
  const { text, overflow } = await boundedBody(response, context);
  context.checkpoint();
  const json = /^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('Content-Type') ?? '');
  /** @type {unknown} */ let data = null;
  if (!overflow && json) { try { data = JSON.parse(text); } catch { /* Safe HTTP errors tolerate malformed upstream bodies. */ } }
  if (!success) {
    /** @type {import('./errors.js').RestErrorCode|null} */ let code = null;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const error = /** @type {Record<string, unknown>} */ (data).error;
      if (error && typeof error === 'object' && !Array.isArray(error)) {
        const raw = /** @type {Record<string, unknown>} */ (error);
        if (typeof raw.code === 'string' && ERROR_CODES.has(raw.code) && typeof raw.message === 'string') code = /** @type {import('./errors.js').RestErrorCode} */ (raw.code);
      }
    }
    throw context.error('http', code);
  }
  if (overflow || !json || (operation === 'createNote' ? ![200, 201].includes(response.status) : response.status !== 200)) throw context.error('invalid_response');
  try { return projectResult(data, operation, response.status, limit, requestedId); }
  catch { throw context.error('invalid_response'); }
}
