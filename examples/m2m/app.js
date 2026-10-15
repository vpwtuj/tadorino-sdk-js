import express from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { TadorinoClient, TadorinoError } from '@bright203/tadorino-sdk-js';
import { TokenProviderError } from './token-provider.js';

/** Loopback-only demonstration bridge. It has no internet-user login system. */
export function createApp({ baseUrl, getAccessToken, frontendOrigin = 'http://127.0.0.1:5174', fetch, timeoutMs }) {
  const origin = new URL(frontendOrigin);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.origin !== frontendOrigin) throw new Error('The demonstration frontend must use an exact loopback origin.');
  // Validate static SDK options at startup, before accepting any local request.
  new TadorinoClient({ baseUrl, getAccessToken, ...(fetch ? { fetch } : {}), ...(timeoutMs === undefined ? {} : { timeoutMs }) });
  const csrf = randomBytes(32).toString('hex');
  const app = express();
  app.disable('x-powered-by');
  app.enable('case sensitive routing');
  app.enable('strict routing');
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
    const host = `127.0.0.1:${req.socket.localPort}`;
    const originHeader = req.headers.origin;
    const site = req.headers['sec-fetch-site'];
    const unexpectedHeader = Object.keys(req.headers).some(header => header.startsWith('x-') && header !== 'x-tadorino-csrf');
    if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== host || (originHeader !== undefined && originHeader !== frontendOrigin)
      || (site !== undefined && site !== 'same-origin') || req.headers.authorization || req.headers.cookie || unexpectedHeader) {
      res.status(403).json({ error: 'local_request_rejected' }); return;
    }
    if (!['GET', 'POST'].includes(req.method)) { res.status(405).json({ error: 'method_not_allowed' }); return; }
    if (req.originalUrl.includes('?') || (req.method === 'GET' && (req.headers['transfer-encoding'] !== undefined
      || (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0')))) {
      res.status(400).json({ error: 'invalid_request' }); return;
    }
    if (!req.accepts('json')) { res.status(406).json({ error: 'json_required' }); return; }
    if (req.method === 'POST' && (originHeader !== frontendOrigin || !req.is('application/json'))) {
      res.status(403).json({ error: 'local_request_rejected' }); return;
    }
    if (req.path !== '/api/bootstrap') {
      const value = req.headers['x-tadorino-csrf'];
      const provided = typeof value === 'string' ? Buffer.from(value) : Buffer.alloc(0);
      const expected = Buffer.from(csrf);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) { res.status(403).json({ error: 'local_request_rejected' }); return; }
    }
    next();
  });
  app.get('/api/bootstrap', (req, res) => { void req; res.json({ csrf, mode: 'local-machine' }); });
  app.use(express.json({ limit: '256kb', strict: true }));
  const route = action => async (req, res) => {
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    req.once('aborted', abort); res.once('close', abort);
    if (req.aborted || res.destroyed) controller.abort();
    let providerFailure = null;
    const boundProvider = async context => {
      try { return await getAccessToken(context); }
      catch (error) { if (error instanceof TokenProviderError) providerFailure = error; throw error; }
    };
    const client = new TadorinoClient({ baseUrl, getAccessToken: boundProvider, ...(fetch ? { fetch } : {}), ...(timeoutMs === undefined ? {} : { timeoutMs }) });
    try {
      const result = await action(client, req, controller.signal);
      if (!res.destroyed) res.json(result);
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      if (providerFailure && error instanceof TadorinoError && error.kind === 'auth') {
        res.status(providerFailure.retryable ? 503 : 502).json({ error: providerFailure.retryable ? 'machine_auth_unavailable' : 'machine_auth_configuration' });
      } else if (error instanceof TadorinoError) {
        const status = error.kind === 'http' ? error.status ?? 502 : error.kind === 'input' ? 400 : error.kind === 'timeout' ? 504 : 502;
        res.status(status).json({ error: error.kind, code: error.errorCode, request_id: error.requestId });
      } else { res.status(502).json({ error: 'upstream_failure' }); }
    } finally { req.off('aborted', abort); res.off('close', abort); }
  };
  app.post('/api/notes', route((client, req, signal) => client.createNote(req.body, { signal })));
  app.post('/api/notes/search', route((client, req, signal) => client.searchNotes(req.body, { signal })));
  app.get('/api/notes/:noteId', route((client, req, signal) => client.getNote(req.params.noteId, { signal })));
  app.use((req, res) => { void req; res.status(404).json({ error: 'not_found' }); });
  app.use((error, req, res, next) => { void error; void req; void next; if (!res.headersSent) res.status(400).json({ error: 'invalid_request' }); });
  return app;
}
