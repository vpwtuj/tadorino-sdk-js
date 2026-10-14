import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** An in-memory, synthetic-only loopback fixture. It is not the Tadorino server. */
export async function startFixture({ port = 0, origins = ['http://127.0.0.1:5173'] } = {}) {
  const notes = new Map();
  const operations = new Map();
  const counts = { create: 0, search: 0, get: 0 };
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'X-Request-ID': randomUUID() }); res.end(JSON.stringify(value)); };
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin) {
      if (!origins.includes(origin)) { json(res, 403, { error: { code: 'invalid_origin', message: 'Synthetic fixture origin rejected.' } }); return; }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '0' }); res.end(); return;
      }
    }
    const token = req.headers.authorization;
    if (typeof token !== 'string' || !/^Bearer synthetic-[A-Za-z0-9-]+$/.test(token)) { json(res, 401, { error: { code: 'invalid_token', message: 'Only synthetic fixture tokens are accepted.' } }); return; }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 256 * 1024) { json(res, 413, { error: { code: 'request_too_large', message: 'Synthetic request too large.' } }); return; } chunks.push(chunk); }
      const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const actorNotes = [...notes.values()].filter(item => item.owner === token);
      if (req.method === 'POST' && req.url === '/v1/notes') {
        counts.create++;
        const key = `${token}:${input.idempotency_key}`;
        const serial = JSON.stringify(input);
        if (operations.has(key)) {
          const previous = operations.get(key);
          if (previous.serial !== serial) { json(res, 409, { error: { code: 'idempotency_conflict', message: 'Synthetic retry conflict.' } }); return; }
          json(res, 200, { note_id: previous.note.note_id, title: previous.note.title, created_at: previous.note.created_at, created: false }); return;
        }
        const note = { note_id: randomUUID(), title: input.title, body: input.body, sources: input.sources ?? [], created_at: new Date().toISOString(), owner: token };
        notes.set(note.note_id, note);
        operations.set(key, { serial, note });
        json(res, 201, { note_id: note.note_id, title: note.title, created_at: note.created_at, created: true }); return;
      }
      if (req.method === 'POST' && req.url === '/v1/notes/search') {
        counts.search++;
        const terms = input.query.split(/\s+/).filter(Boolean);
        const found = actorNotes.filter(note => terms.every(term => `${note.title} ${note.body}`.includes(term))).reverse();
        const limit = input.limit ?? 10;
        json(res, 200, { items: found.slice(0, limit).map(note => ({ note_id: note.note_id, title: note.title, snippet: note.body.slice(0, 160), created_at: note.created_at })), has_more: found.length > limit }); return;
      }
      if (req.method === 'GET' && /^\/v1\/notes\/[0-9a-f-]+$/.test(req.url ?? '')) {
        counts.get++;
        const note = notes.get(req.url.split('/').at(-1));
        if (note?.owner === token) { const { owner, ...memo } = note; void owner; json(res, 200, memo); return; }
      }
      json(res, 404, { error: { code: 'not_found', message: 'Synthetic memo unavailable.' } });
    } catch { json(res, 400, { error: { code: 'invalid_request', message: 'Synthetic input rejected.' } }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, counts, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await startFixture({ port: Number(process.env.FIXTURE_PORT ?? 4010) });
  console.log(`Synthetic-only memo fixture: ${fixture.baseUrl} (OTP/Auth0/PostgreSQL are not tested).`);
  for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { void fixture.close().then(() => process.exit(0)); });
}
