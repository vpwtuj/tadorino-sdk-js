import { TadorinoClient, type ImportNotesInput, type UpdateNoteInput, type ExportNotesInput, type RequestOptions } from '@bright203/tadorino-sdk-js';

/** Retain this object until the user confirms success or explicitly starts a new copy. */
export function prepareFileImport(file: File): ImportNotesInput {
  return Object.freeze({ archive: file, idempotency_key: crypto.randomUUID() });
}

/** Repeated calls retain the same File and key. No token or secret belongs in this object. */
export async function importFile(client: TadorinoClient, pending: ImportNotesInput, options?: RequestOptions) {
  return client.importNotes(pending, options);
}

/** Capture an edit once. A conflict requires re-reading the memo before making a new edit. */
export function prepareBodyUpdate(noteId: string, revision: number, body: string): UpdateNoteInput {
  return Object.freeze({ note_id: noteId, expected_revision: revision, body, idempotency_key: crypto.randomUUID() });
}

/**
 * Connect to a user-selected destination. Resolves only after ZIP EOF and sink close.
 * A destination failure cancels the SDK stream. Show “complete” only after this resolves.
 * Browsers without file-system streams may use a separately bounded download buffer.
 */
export async function exportToDestination(client: TadorinoClient, input: ExportNotesInput,
  destination: WritableStream<Uint8Array>, options?: RequestOptions) {
  const result = await client.exportNotes(input, options);
  await result.stream.pipeTo(destination, options?.signal ? { signal: options.signal } : undefined);
}
