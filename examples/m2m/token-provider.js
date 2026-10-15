import { performance } from 'node:perf_hooks';

const messages = {
  configuration: 'The machine token provider configuration is invalid.',
  http: 'The authorization service rejected the machine token request.',
  network: 'The authorization service could not be reached.',
  timeout: 'The machine token request exceeded its deadline.',
  invalid_response: 'The authorization service returned an invalid token response.',
  aborted: 'The caller stopped waiting for the machine token.',
};

/** Safe server-side metadata only; never includes credentials or OAuth bodies. */
export class TokenProviderError extends Error {
  constructor(kind, status = null) {
    const selected = Object.hasOwn(messages, kind) ? kind : 'configuration';
    super(messages[selected]);
    this.name = 'TokenProviderError';
    this.kind = selected;
    this.status = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
    this.retryable = selected === 'network' || selected === 'timeout' || (selected === 'http' && (status === 429 || status >= 500));
  }
}

const invalid = () => { throw new TokenProviderError('configuration'); };
const maxResponseBytes = 64 * 1024;

/**
 * Node-only application helper, not an SDK export. One instance is bound to one
 * issuer/client/audience/scope configuration. Reuse it for that machine's jobs.
 * Authentication is performed only by the fixed HTTPS /oauth/token endpoint.
 * No Refresh Token, automatic retry, disk storage, or mutable global token exists.
 */
export function createTokenProvider(config, { fetch = globalThis.fetch, now = () => performance.now() } = {}) {
  let endpoint;
  let body;
  let timeoutMs;
  try {
    if (!config || typeof config !== 'object' || Array.isArray(config)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(config))) invalid();
    const allowed = ['issuer', 'clientId', 'clientSecret', 'audience', 'scopes', 'timeoutMs'];
    const properties = Object.getOwnPropertyDescriptors(config);
    if (Object.keys(properties).some(key => !allowed.includes(key) || !Object.hasOwn(properties[key], 'value'))) invalid();
    const issuer = new URL(config.issuer);
    if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash || issuer.pathname !== '/') invalid();
    if (typeof config.clientId !== 'string' || (!/^[A-Za-z0-9_-]{1,128}$/.test(config.clientId) || /\s/.test(config.clientId))) invalid();
    if (typeof config.clientSecret !== 'string' || !config.clientSecret || config.clientSecret.length > 4096 || /[\r\n\0]/.test(config.clientSecret)) invalid();
    if (typeof config.audience !== 'string' || !config.audience || config.audience.length > 2048 || /\s/.test(config.audience)) invalid();
    const scopes = config.scopes ?? ['notes:read', 'notes:write'];
    if (!Array.isArray(scopes) || !scopes.length || scopes.some(scope => !['notes:read', 'notes:write'].includes(scope))) invalid();
    timeoutMs = config.timeoutMs ?? 10_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 || typeof fetch !== 'function' || typeof now !== 'function') invalid();
    endpoint = `${issuer.origin}/oauth/token`;
    body = JSON.stringify({ grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret,
      audience: config.audience, scope: [...new Set(scopes)].sort().join(' ') });
  } catch { invalid(); }

  let cached = null;
  let inFlight = null;
  const mint = async () => {
    const controller = new AbortController();
    const started = now();
    let timedOut = false;
    let response;
    let reader;
    let timer;
    const deadline = new Promise((resolve, reject) => {
      void resolve;
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        if (reader) void reader.cancel().catch(() => {});
        reject(new TokenProviderError('timeout'));
      }, timeoutMs);
    });
    const work = async () => {
      try {
        response = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body, signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
        if (timedOut) throw new TokenProviderError('timeout');
        if (response.status !== 200) throw new TokenProviderError('http', response.status);
        if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw new TokenProviderError('invalid_response');
        reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (timedOut) throw new TokenProviderError('timeout');
            if (chunk.done) break;
            if (!(chunk.value instanceof Uint8Array)) throw new TokenProviderError('invalid_response');
            size += chunk.value.byteLength;
            if (size > maxResponseBytes) { void reader.cancel().catch(() => {}); throw new TokenProviderError('invalid_response'); }
            if (chunk.value.byteLength) chunks.push(chunk.value);
          }
        } finally { try { reader.releaseLock(); } catch { /* A pending read is cancelled by the deadline. */ } }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        let value;
        try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
        catch { throw new TokenProviderError('invalid_response'); }
        if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.access_token !== 'string' || !value.access_token || /\s/.test(value.access_token) || !/^[A-Za-z0-9._~+\/-]+=*$/.test(value.access_token)
          || typeof value.token_type !== 'string' || value.token_type.toLowerCase() !== 'bearer' || !Number.isSafeInteger(value.expires_in) || value.expires_in < 1 || value.expires_in > 2_592_000) {
          throw new TokenProviderError('invalid_response');
        }
        const lifetime = value.expires_in * 1000;
        // Conservative start time includes network delay. Short lifetimes retain
        // a 10% margin; longer ones expire from this cache 30 seconds early.
        const expiresAt = started + lifetime - Math.min(30_000, lifetime / 10);
        if (timedOut || now() >= expiresAt) throw new TokenProviderError(timedOut ? 'timeout' : 'invalid_response');
        return { token: value.access_token, expiresAt };
      } catch (error) {
        if (error instanceof TokenProviderError) throw error;
        throw new TokenProviderError(timedOut ? 'timeout' : 'network');
      } finally {
        if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      }
    };
    try { return await Promise.race([work(), deadline]); }
    finally { clearTimeout(timer); }
  };

  const waitForCaller = (promise, signal) => {
    if (!signal) return promise;
    return new Promise((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(new TokenProviderError('aborted')); };
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      promise.then(value => { signal.removeEventListener('abort', abort); signal.aborted ? abort() : resolve(value); }, error => {
        signal.removeEventListener('abort', abort); signal.aborted ? abort() : reject(error);
      });
    });
  };

  return async function getAccessToken({ signal } = {}) {
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TokenProviderError('configuration');
    if (signal?.aborted) throw new TokenProviderError('aborted');
    if (cached && now() < cached.expiresAt) return cached.token;
    cached = null;
    if (!inFlight) {
      inFlight = mint().then(value => { cached = value; return value.token; }).finally(() => { inFlight = null; });
      // Shared acquisition may outlive every caller. Its eventual failure is
      // still handled; one caller's cancellation never cancels other waiters.
      void inFlight.catch(() => {});
    }
    return waitForCaller(inFlight, signal);
  };
}
