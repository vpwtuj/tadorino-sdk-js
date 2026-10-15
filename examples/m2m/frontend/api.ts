import type { CreateNoteInput, CreateNoteResult, SearchNotesInput, SearchNotesResult, GetNoteResult } from '@bright203/tadorino-sdk-js';

let csrf: string | null = null;
export class LocalApiError extends Error {
  constructor(readonly status: number) { super('The local machine operation could not be completed.'); }
}
async function request<T>(path: string, method: 'GET' | 'POST', input: unknown, signal: AbortSignal): Promise<T> {
  if (!csrf) {
    const response = await fetch('/api/bootstrap', { signal, credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new LocalApiError(response.status);
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || !('csrf' in value) || typeof value.csrf !== 'string' || !/^[a-f0-9]{64}$/.test(value.csrf)) throw new LocalApiError(502);
    csrf = value.csrf;
  }
  const response = await fetch(path, { method, signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
    headers: { Accept: 'application/json', 'X-Tadorino-CSRF': csrf, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(input) } : {}) });
  if (!response.ok) throw new LocalApiError(response.status);
  return response.json() as Promise<T>;
}
export const notes = {
  createNote: (input: CreateNoteInput, signal: AbortSignal) => request<CreateNoteResult>('/api/notes', 'POST', input, signal),
  searchNotes: (input: SearchNotesInput, signal: AbortSignal) => request<SearchNotesResult>('/api/notes/search', 'POST', input, signal),
  getNote: (id: string, signal: AbortSignal) => request<GetNoteResult>(`/api/notes/${encodeURIComponent(id)}`, 'GET', undefined, signal),
};
