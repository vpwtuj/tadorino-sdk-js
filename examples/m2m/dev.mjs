import { createServer } from 'vite';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { startLocalDemo } from './server.mjs';

/** Start the frontend only after this process owns the configured backend port. */
export async function startDev({ startBackend = startLocalDemo, createFrontend = createServer } = {}) {
  let backend; let vite;
  const close = async () => {
    await vite?.close();
    if (backend) await new Promise(resolve => { backend.closeAllConnections(); backend.close(resolve); });
  };
  try {
    backend = startBackend();
    await once(backend, 'listening');
    vite = await createFrontend(); await vite.listen();
    return { close };
  } catch { await close(); throw new Error('Local M2M demo could not start. Check server-side configuration and ports.'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const app = await startDev();
    console.log('Local M2M example: http://127.0.0.1:5174 (backend 127.0.0.1:5181).');
    for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { void app.close().then(() => process.exit(0)); });
  } catch { console.error('Local M2M demo could not start. Check server-side configuration and ports.'); process.exitCode = 1; }
}
