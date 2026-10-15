import { TadorinoError, safeRequestId } from './errors.js';
import { parseResponse } from './http.js';
/** @internal */
export const ARCHIVE_LIMIT = 80 * 1024 * 1024;
const usedStreams = new WeakSet();
/**
 * Take ownership of the deadline until EOF, cancellation, or failure.
 * @internal @param {Response} response @param {import('./http.js').OperationContext} context
 * @param {import('./lifecycle-validation.js').RequestPlan} plan
 * @returns {Promise<import('./lifecycle-types.js').ExportNotesResult>}
 */
export async function exportStream(response,context,plan) {
  if (!(response instanceof Response)) throw context.error('network');
  context.status = response.status; context.requestId = safeRequestId(response.headers.get('X-Request-ID'));
  if (response.status < 200 || response.status >= 300) { await parseResponse(response,context,'exportNotes',plan); throw context.error('invalid_response'); }
  const length = response.headers.get('Content-Length');
  if (response.status !== 200 || !/^application\/zip(?:\s*;|\s*$)/i.test(response.headers.get('Content-Type') ?? '')
    || (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length)>ARCHIVE_LIMIT)) || !response.body) {
    context.controller.abort();
    try { void response.body?.cancel().catch(()=>{}); } catch { /* Safe cleanup. */ }
    throw context.error('invalid_response');
  }
  const reader = response.body.getReader(); context.reader = reader;
  let received = 0; let ended = false;
  /** @type {ReadableStreamDefaultController<Uint8Array>} */ let output;
  const finish = () => { if (ended) return; ended = true; context.close(); };
  const fail = () => { if (ended) return; context.controller.abort(); context.cancelReader(); finish(); };
  const stream = new ReadableStream({
    start(controller) { output = controller; void context.interrupted.catch(error => { if (!ended) { controller.error(error); fail(); } }); },
    async pull(controller) {
      try {
        const {done,value} = await context.race(reader.read());
        if (ended) return;
        if (done) { controller.close(); finish(); return; }
        if (!(value instanceof Uint8Array)) throw context.error('invalid_response');
        received += value.byteLength;
        if (received>ARCHIVE_LIMIT) throw context.error('invalid_response');
        if (value.byteLength) controller.enqueue(value);
      } catch (error) {
        if (ended) return;
        let safe = error instanceof TadorinoError ? error : context.error('network');
        try { context.checkpoint(); } catch (interrupted) { safe = /** @type {TadorinoError} */(interrupted); }
        output.error(safe); fail();
      }
    },
    cancel() { context.controller.abort(); fail(); },
  }, {highWaterMark:0});
  return {stream,content_type:'application/zip',filename:'tadorino-export.zip'};
}

/** @internal @typedef {{body: BodyInit, duplex?: 'half', cancel: () => void}} Upload */
/** @internal @param {unknown} archive @returns {Blob|Uint8Array|ReadableStream<Uint8Array>} */
export function validateArchive(archive) {
  if (archive instanceof Uint8Array) { if (archive.byteLength > ARCHIVE_LIMIT) throw new Error('size'); return archive.slice(); }
  if (typeof Blob !== 'undefined' && archive instanceof Blob) { if (archive.size > ARCHIVE_LIMIT) throw new Error('size'); return archive; }
  if (archive instanceof ReadableStream && !archive.locked && !usedStreams.has(archive)) {
    // Browsers without streaming request support reject a stream before any token/network call.
    let duplex = false;
    const init = {method:'POST',body:new ReadableStream(),
      get duplex() { duplex = true; return 'half'; }};
    const request = new Request('https://example.invalid', init);
    if (!duplex || request.headers.has('Content-Type')) throw new Error('stream');
    return archive;
  }
  throw new Error('archive');
}
/** @internal @param {Blob|Uint8Array|ReadableStream<Uint8Array>} archive @param {import('./http.js').OperationContext} context @returns {Upload} */
export function uploadBody(archive,context) {
  if (!(archive instanceof ReadableStream)) return {body: /** @type {BodyInit} */(archive),cancel:()=>{}};
  if (usedStreams.has(archive) || archive.locked) throw context.error('input');
  usedStreams.add(archive);
  const reader = archive.getReader(); let length = 0; let ended = false;
  const cleanup = () => { if (ended) return; ended = true; try { void reader.cancel().catch(()=>{}).finally(()=>{try{reader.releaseLock();}catch{/* cleanup */}}); } catch {/* cleanup */} };
  void context.interrupted.catch(cleanup);
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const result = await context.race(reader.read()); if (ended) return;
        if (result.done) { ended=true; reader.releaseLock(); controller.close(); return; }
        if (!(result.value instanceof Uint8Array)) throw context.error('input');
        length += result.value.byteLength; if (length>ARCHIVE_LIMIT) throw context.error('input');
        if (result.value.byteLength) controller.enqueue(result.value);
      } catch(error) {
        if (ended) return;
        const safe = error instanceof TadorinoError ? error : context.error('network');
        controller.error(safe); context.reject(safe); context.controller.abort(); cleanup();
      }
    }, cancel:cleanup,
  }, {highWaterMark:0});
  return {body,duplex:'half',cancel:cleanup};
}
