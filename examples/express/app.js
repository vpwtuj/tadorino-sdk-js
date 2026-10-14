import express from 'express';
import { TadorinoClient, TadorinoError } from '@bright203/tadorino-sdk-js';

/**
 * Create an app after attaching the host application's authenticated sessions.
 * resolveSession must return a session-bound token function, never read an
 * access token from a caller-supplied query/header/body.
 */
export function createApp({ baseUrl, resolveSession, fetch, timeoutMs }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use((req, res, next) => {
    const controller = new AbortController();
    res.locals.signal = controller.signal;
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    const close = () => { abort(); cleanup(); };
    const cleanup = () => { req.off('aborted', abort); res.off('close', close); res.off('finish', cleanup); };
    req.once('aborted', abort);
    res.once('close', close);
    res.once('finish', cleanup);
    if (req.aborted || res.destroyed) abort();
    next();
  });
  app.use(async (req, res, next) => {
    try {
      const session = await resolveSession(req);
      if (res.locals.signal.aborted || req.aborted || res.destroyed) return;
      if (!session || typeof session.userId !== 'string' || !session.userId || typeof session.getAccessToken !== 'function') {
        res.status(401).json({ error: 'login_required' });
        return;
      }
      // Each request closes over its own authenticated session. Refresh and
      // secure storage stay in the host app's session implementation.
      res.locals.notes = new TadorinoClient({ baseUrl, getAccessToken: session.getAccessToken, ...(fetch ? { fetch } : {}), ...(timeoutMs === undefined ? {} : { timeoutMs }) });
      next();
    } catch { if (!res.destroyed && !res.locals.signal.aborted) res.status(401).json({ error: 'login_required' }); }
  });
  const route = action => async (req, res) => {
    const signal = res.locals.signal;
    if (signal.aborted || req.aborted || res.destroyed) return;
    try { res.json(await action(res.locals.notes, req, signal)); }
    catch (error) {
      if (res.headersSent || res.destroyed) return;
      if (error instanceof TadorinoError) {
        const status = error.kind === 'http' ? error.status ?? 502 : error.kind === 'input' ? 400 : error.kind === 'auth' ? 401 : error.kind === 'timeout' ? 504 : 502;
        res.status(status).json({ error: error.kind, code: error.errorCode, request_id: error.requestId });
      } else { res.status(502).json({ error: 'upstream_failure' }); }
    }
  };
  app.post('/api/notes', route((client, req, signal) => client.createNote(req.body, { signal })));
  app.post('/api/notes/search', route((client, req, signal) => client.searchNotes(req.body, { signal })));
  app.get('/api/notes/:noteId', route((client, req, signal) => client.getNote(req.params.noteId, { signal })));
  app.use((error, req, res, next) => {
    void error; void req; void next;
    if (!res.headersSent) res.status(400).json({ error: 'invalid_request' });
  });
  return app;
}
