/** @typedef {import('./errors.js').Operation} Operation */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** @internal */
export const REQUEST_LIMIT = 256 * 1024;

/** @internal @param {unknown} value @param {string[]} keys @param {string[]} required @returns {Record<string, unknown>} */
export function inputObject(value, keys, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('shape');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if ('toJSON' in value || Reflect.ownKeys(descriptors).some(key => typeof key !== 'string'
    || !keys.includes(key) || !descriptors[key].enumerable || !('value' in descriptors[key]))) throw new Error('keys');
  if (required.some(key => !Object.hasOwn(descriptors, key))) throw new Error('required');
  return /** @type {Record<string, unknown>} */ (value);
}

/** @internal @param {unknown} value @returns {number} */
export function timeout(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 300_000) throw new Error('timeout');
  return value;
}

/** @internal @param {unknown} value @returns {string} */
export function origin(value) {
  if (typeof value !== 'string' || /[\s\\]/.test(value) || !/^https?:\/\//.test(value)) throw new Error('url');
  const parsed = new URL(value);
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('url');
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) throw new Error('url');
  // Reject parser canonicalizations of dot paths, shorthand IPv4, and userinfo.
  if (!/^https?:\/\/[^/?#@]+\/?$/.test(value)) throw new Error('url');
  if (parsed.protocol === 'http:' && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/.test(value)) throw new Error('url');
  return parsed.origin;
}

/** @param {unknown} value @returns {unknown[]} */
function inputArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || 'toJSON' in value) throw new Error('array');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.some(key => typeof key !== 'string' || (key !== 'length' && !/^(?:0|[1-9]\d*)$/.test(key)))) throw new Error('array');
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new Error('array');
  }
  return value;
}

/** @param {unknown} value @returns {string} */
function inputString(value) {
  if (typeof value !== 'string') throw new Error('string');
  return value;
}

/** @internal @param {unknown} input @param {Operation} operation @returns {{body: string, limit: number}} */
export function snapshot(input, operation) {
  /** @type {Record<string, unknown>} */
  const copy = Object.create(null);
  let limit = 10;
  if (operation === 'createNote') {
    const raw = inputObject(input, ['title', 'body', 'sources', 'idempotency_key'], ['title', 'body', 'idempotency_key']);
    copy.title = inputString(raw.title);
    copy.body = inputString(raw.body);
    copy.idempotency_key = inputString(raw.idempotency_key);
    if (!UUID.test(/** @type {string} */ (copy.idempotency_key))) throw new Error('uuid');
    if (Object.hasOwn(raw, 'sources')) {
      const sources = inputArray(raw.sources);
      if (sources.length > 20) throw new Error('sources');
      copy.sources = sources.map(value => {
        const source = inputObject(value, ['title', 'url', 'excerpt']);
        if (Object.keys(source).length === 0) throw new Error('source');
        /** @type {Record<string, string>} */
        const projected = Object.create(null);
        for (const key of ['title', 'url', 'excerpt']) if (Object.hasOwn(source, key)) projected[key] = inputString(source[key]);
        return projected;
      });
    }
  } else {
    const raw = inputObject(input, ['query', 'limit'], ['query']);
    copy.query = inputString(raw.query);
    if (Object.hasOwn(raw, 'limit')) {
      if (typeof raw.limit !== 'number' || !Number.isInteger(raw.limit) || raw.limit < 1 || raw.limit > 20) throw new Error('limit');
      copy.limit = raw.limit;
      limit = raw.limit;
    }
  }
  const body = JSON.stringify(copy);
  if (new TextEncoder().encode(body).byteLength > REQUEST_LIMIT) throw new Error('size');
  return { body, limit };
}

/** @internal @param {unknown} value @returns {string} */
export function noteId(value) {
  if (typeof value !== 'string' || !UUID4.test(value.toLowerCase())) throw new Error('uuid');
  return value.toLowerCase();
}

/** @internal @param {unknown} value @param {number} defaultTimeout @returns {{signal: AbortSignal|undefined, timeoutMs: number}} */
export function requestOptions(value, defaultTimeout) {
  const raw = inputObject(value === undefined ? {} : value, ['signal', 'timeoutMs']);
  let signal;
  if (Object.hasOwn(raw, 'signal')) {
    if (!(raw.signal instanceof AbortSignal)) throw new Error('signal');
    signal = raw.signal;
  }
  return { signal, timeoutMs: Object.hasOwn(raw, 'timeoutMs') ? timeout(raw.timeoutMs) : defaultTimeout };
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function resultObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @param {number} maximum @param {number} [minimum] @returns {string} */
function resultString(value, maximum, minimum = 0) {
  if (typeof value !== 'string' || [...value].length < minimum || [...value].length > maximum
    || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) throw new Error('string');
  return value;
}

/** @param {unknown} value @returns {string} */
function resultTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(value)) throw new Error('date');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== value.slice(0, 19)) throw new Error('date');
  return value;
}

/** @param {Record<string, unknown>} raw @returns {{note_id: string, title: string, created_at: string}} */
function summary(raw) {
  if (typeof raw.note_id !== 'string' || !UUID4.test(raw.note_id)) throw new Error('uuid');
  return { note_id: raw.note_id, title: resultString(raw.title, 200, 1), created_at: resultTimestamp(raw.created_at) };
}

/** @param {unknown} value @returns {import('./client.js').Source} */
function resultSource(value) {
  const source = resultObject(value);
  /** @type {import('./client.js').Source} */
  const result = {};
  for (const [key, maximum] of /** @type {[keyof import('./client.js').Source, number][]} */ ([['title', 300], ['url', 2048], ['excerpt', 1000]])) {
    if (Object.hasOwn(source, key)) {
      result[key] = resultString(source[key], maximum, 1);
      if (!/\S/u.test(result[key])) throw new Error('source');
    }
  }
  if (Object.keys(result).length === 0) throw new Error('source');
  if (result.url !== undefined && !['http:', 'https:'].includes(new URL(result.url).protocol)) throw new Error('source');
  return result;
}

/**
 * Validate and project only known public output fields without sorting or transforming text.
 * @internal
 * @param {unknown} value
 * @param {'createNote'|'searchNotes'|'getNote'} operation
 * @param {number} status
 * @param {number} limit
 * @param {string|null} requestedId
 * @returns {import('./client.js').CreateNoteResult|import('./client.js').SearchNotesResult|import('./client.js').GetNoteResult}
 */
export function projectResult(value, operation, status, limit, requestedId) {
  const raw = resultObject(value);
  if (operation === 'searchNotes') {
    if (!Array.isArray(raw.items) || raw.items.length > Math.min(20, limit) || typeof raw.has_more !== 'boolean') throw new Error('search');
    return {
      items: raw.items.map(value => {
        const item = resultObject(value);
        return { ...summary(item), snippet: resultString(item.snippet, 200) };
      }),
      has_more: raw.has_more,
    };
  }
  const common = summary(raw);
  if (operation === 'createNote') {
    if (typeof raw.created !== 'boolean' || raw.created !== (status === 201)) throw new Error('created');
    return { ...common, created: raw.created };
  }
  if (common.note_id !== requestedId || !Array.isArray(raw.sources) || raw.sources.length > 20) throw new Error('get');
  const body = resultString(raw.body, 20_000, 1);
  if (!/\S/u.test(body)) throw new Error('body');
  return { ...common, body, sources: raw.sources.map(resultSource) };
}
