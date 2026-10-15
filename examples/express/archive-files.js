import { open, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

/**
 * Stream to a new private file. Refuse overwrites and remove only this operation's
 * partial file on failure. The caller reports completion only after sync and close.
 * The supplied SDK instance remains bound to the authenticated request's session.
 */
export async function exportToFile(client, input, destination, options) {
  const { stream } = await client.exportNotes(input, options);
  let handle;
  try { handle = await open(destination, 'wx', 0o600); }
  catch (error) { await stream.cancel().catch(() => {}); throw error; }
  let position = 0;
  try {
    await stream.pipeTo(new WritableStream({
      async write(chunk) {
        let offset = 0;
        while (offset < chunk.byteLength) {
          const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset, position);
          if (!bytesWritten) throw new Error('Destination write failed.');
          offset += bytesWritten; position += bytesWritten;
        }
      },
      async close() { await handle.sync(); await handle.close(); },
      async abort() { await handle.close(); },
    }), options?.signal ? { signal: options.signal } : undefined);
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(destination).catch(() => {});
    throw error;
  }
}

/**
 * Keep path + original key until the outcome is known. Reopen the same unchanged
 * file for each explicit retry; never reuse an already consumed request stream.
 * The app must keep the selected file immutable while a result is uncertain.
 */
export async function importFromFile(client, path, idempotencyKey, options) {
  const source = createReadStream(path);
  try {
    return await client.importNotes({ archive: Readable.toWeb(source), idempotency_key: idempotencyKey }, options);
  } finally { source.destroy(); }
}
