import { inputObject, inputArray, noteId, snapshot, REQUEST_LIMIT, resultObject as object, resultString as string, resultTimestamp as date, resultSource, projectResult } from './validation.js';

/** @internal @param {unknown} value @returns {number} */
export function positive(value) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('integer'); return value; }
/** @param {unknown} value @returns {boolean} */
function bool(value) { if (typeof value !== 'boolean') throw new Error('boolean'); return value; }
/** @param {unknown} value @returns {string} */
function uuid(value) { const id = noteId(value); if (id !== value) throw new Error('uuid'); return id; }
/** @param {unknown} value @returns {string} */
function cursor(value) { const parsed = string(value, 16_384, 1); if (!parsed.trim()) throw new Error('cursor'); return parsed; }
/** @param {Record<string, unknown>} raw @returns {Record<string, unknown>} */
function page(raw) {
  const limit = raw.limit === undefined ? 10 : positive(raw.limit);
  if (limit > 20 || (Object.hasOwn(raw, 'limit') && raw.limit === undefined)) throw new Error('limit');
  return { ...(Object.hasOwn(raw, 'limit') ? { limit } : {}), ...(Object.hasOwn(raw, 'cursor') ? { cursor: cursor(raw.cursor) } : {}) };
}
/** @param {unknown} value @returns {string[]} */
function ids(value) { const array = inputArray(value); if (!array.length || array.length > 1000) throw new Error('ids'); const result = array.map(noteId); if (new Set(result).size !== result.length) throw new Error('duplicate'); return result; }
/** @param {Record<string, unknown>} raw @returns {Record<string, unknown>} */
function selection(raw) {
  if (Object.hasOwn(raw, 'state') && !['active', 'archived', 'trashed', 'active_and_archived'].includes(/** @type {string} */(raw.state))) throw new Error('state');
  return { ...page(raw), ...(Object.hasOwn(raw, 'state') ? { state: raw.state } : {}) };
}
/** @internal @typedef {{path: string, method: string, body?: string, id: string|null, version?: number, limit: number}} RequestPlan */
/** @internal @param {import('./errors.js').Operation} operation @param {unknown} input @returns {RequestPlan} */
export function requestPlan(operation, input) {
  let path = ''; let method = 'POST'; let id = null; let limit = 10; let version;
  /** @type {Record<string, unknown>|undefined} */ let data;
  if (operation === 'createNote') return { path: '/v1/notes', method, ...snapshot(input, operation), id };
  if (['getNote','getTrashedNote','getNoteImport','getNotePurge','cancelNoteImport'].includes(operation ?? '')) {
    id = noteId(input);
    path = operation === 'getNoteImport' || operation === 'cancelNoteImport' ? `/v1/note-imports/${id}` : operation === 'getNotePurge' ? `/v1/note-purges/${id}` : `/v1/notes/${id}${operation === 'getTrashedNote' ? '/trash' : ''}`;
    if (operation === 'cancelNoteImport') { path += '/cancel'; data = {}; } else method = 'GET';
  } else if (operation === 'searchNotes' || operation === 'listNotes') {
    const raw = inputObject(input, ['query', 'state', 'limit', 'cursor'].filter(k => operation === 'searchNotes' || k !== 'query'), operation === 'searchNotes' ? ['query'] : []);
    data = selection(raw);
    if (operation === 'searchNotes') { if (typeof raw.query !== 'string') throw new Error('query'); data = { query: raw.query, ...data }; }
    limit = /** @type {number} */(data.limit ?? 10); path = `/v1/notes/${operation === 'searchNotes' ? 'search' : 'list'}`;
  } else if (operation === 'exportNotes') {
    const raw = inputObject(input, ['states','include_history','note_ids']); data = {};
    if (Object.hasOwn(raw,'states')) { const states = inputArray(raw.states); if (!states.length || states.length > 3 || states.some(s => !['active','archived','trashed'].includes(/** @type {string} */(s))) || new Set(states).size !== states.length) throw new Error('states'); data.states = [...states]; }
    if (Object.hasOwn(raw,'include_history')) data.include_history = bool(raw.include_history);
    if (Object.hasOwn(raw,'note_ids')) data.note_ids = ids(raw.note_ids);
    path = '/v1/notes/export';
  } else if (operation === 'importNotes') {
    const raw = inputObject(input, ['idempotency_key','source_note_ids'], ['idempotency_key']); data = { idempotency_key: noteId(raw.idempotency_key) };
    if (Object.hasOwn(raw,'source_note_ids')) data.source_note_ids = ids(raw.source_note_ids);
    path = '/v1/note-imports';
  } else {
    const listing = operation === 'listNoteVersions' || operation === 'listTrashedNoteVersions';
    const versioned = ['getNoteVersion','getTrashedNoteVersion','restoreNoteVersion'].includes(operation ?? '');
    const reading = listing || operation === 'getNoteVersion' || operation === 'getTrashedNoteVersion';
    const keys = ['note_id', ...(listing ? ['limit','cursor'] : versioned ? ['version'] : []), ...(!reading ? ['expected_revision','idempotency_key'] : []), ...(operation === 'updateNote' ? ['title','body','sources'] : [])];
    const raw = inputObject(input, keys, ['note_id', ...(versioned ? ['version'] : []), ...(!reading ? ['expected_revision','idempotency_key'] : [])]);
    id = noteId(raw.note_id); path = `/v1/notes/${id}`;
    if (versioned) version = positive(raw.version);
    if (listing) { path += `${operation === 'listTrashedNoteVersions' ? '/trash' : ''}/versions/list`; data = page(raw); limit = /** @type {number} */(data.limit ?? 10); }
    else if (reading) { method = 'GET'; path += `${operation === 'getTrashedNoteVersion' ? '/trash' : ''}/versions/${version}`; }
    else {
      data = { expected_revision: positive(raw.expected_revision), idempotency_key: noteId(raw.idempotency_key) };
      if (operation === 'updateNote') {
        method = 'PATCH'; if (!['title','body','sources'].some(k => Object.hasOwn(raw,k))) throw new Error('empty');
        const content = JSON.parse(snapshot({ title: 'validation', body: 'validation', ...Object.fromEntries(['title','body','sources'].filter(k => Object.hasOwn(raw,k)).map(k => [k,raw[k]])), idempotency_key: raw.idempotency_key }, 'createNote').body);
        for (const key of ['title','body','sources']) if (Object.hasOwn(raw,key)) data[key] = content[key];
      } else if (operation === 'restoreNoteVersion') path += `/versions/${version}/restore`;
      else { const action = /** @type {Record<string,string>} */({ archiveNote:'archive',unarchiveNote:'unarchive',trashNote:'trash',restoreNote:'restore',purgeNote:'purge' })[operation ?? '']; if (!action) throw new Error('operation'); path += `/${action}`; }
    }
  }
  const body = data === undefined ? undefined : JSON.stringify(data);
  if (body && new TextEncoder().encode(body).byteLength > REQUEST_LIMIT) throw new Error('size');
  return { path, method, body, id, version, limit };
}

/** @internal @param {Record<string,unknown>} raw @param {boolean} [optional] @returns {Record<string,unknown>} */
export function metadata(raw, optional = false) {
  const keys = ['state','revision','content_version','updated_at','state_changed_at','trashed_at','restore_state'];
  if (optional && !keys.some(k => Object.hasOwn(raw,k))) return {};
  if (!['active','archived','trashed'].includes(/** @type {string} */(raw.state))) throw new Error('state');
  const result = { state:raw.state, revision:positive(raw.revision),content_version:positive(raw.content_version),updated_at:date(raw.updated_at),state_changed_at:date(raw.state_changed_at) };
  if (raw.state === 'trashed') { if (!['active','archived'].includes(/** @type {string} */(raw.restore_state))) throw new Error('restore'); return { ...result, trashed_at:date(raw.trashed_at),restore_state:raw.restore_state }; }
  if (Object.hasOwn(raw,'trashed_at') || Object.hasOwn(raw,'restore_state')) throw new Error('trash');
  return result;
}
/** @param {unknown} value @param {boolean} version @returns {Record<string,unknown>} */
function provenance(value, version) {
  const raw = object(value); const result = { source_note_id:uuid(raw.source_note_id),imported_at:date(raw.imported_at) };
  if (!version) return { ...result,source_created_at:date(raw.source_created_at),source_updated_at:date(raw.source_updated_at),source_state_changed_at:date(raw.source_state_changed_at),...(Object.hasOwn(raw,'source_trashed_at') ? { source_trashed_at:date(raw.source_trashed_at) } : {}) };
  if (!['create','update','restore','import'].includes(/** @type {string} */(raw.source_operation))) throw new Error('source');
  if (raw.source_operation !== 'restore' && Object.hasOwn(raw,'source_restored_from_version')) throw new Error('source');
  return { ...result, source_content_version:positive(raw.source_content_version),source_recorded_at:date(raw.source_recorded_at),source_operation:raw.source_operation,...(raw.source_operation === 'restore' ? { source_restored_from_version:positive(raw.source_restored_from_version) } : {}) };
}
/** @param {Record<string, unknown>} raw @param {boolean} version @returns {Record<string,unknown>} */
function origins(raw, version) {
  const key = version ? 'provenance' : 'import_origin';
  if (!Object.hasOwn(raw,key)) { if (Object.hasOwn(raw,'prior_provenance')) throw new Error('provenance'); return {}; }
  const result = { [key]: provenance(raw[key],version),...(Object.hasOwn(raw,'prior_provenance') ? { prior_provenance: array(raw.prior_provenance, 1000).map(v => provenance(v,version)) } : {}) };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 64*1024) throw new Error('size');
  return result;
}
/** @param {unknown} value @param {number} max @returns {unknown[]} */
function array(value,max) { if (!Array.isArray(value) || value.length > max) throw new Error('array'); return value; }
/** @param {Record<string,unknown>} raw @returns {{has_more: boolean,next_cursor: string|null}} */
function pagination(raw) { const more = bool(raw.has_more); const next = raw.next_cursor === null ? null : cursor(raw.next_cursor); if (more !== (next !== null)) throw new Error('page'); return {has_more:more,next_cursor:next}; }
/** @param {Record<string,unknown>} raw @param {boolean} full @returns {Record<string,unknown>} */
function versionResult(raw,full) {
  const result = { content_version:positive(raw.content_version),recorded_at:date(raw.recorded_at),source:raw.source };
  if (!['create','update','restore','import'].includes(/** @type {string} */(raw.source))) throw new Error('source');
  /** @type {Record<string,unknown>} */ let source = {};
  if (raw.source === 'restore') { const restored = positive(raw.restored_from_version); if (restored >= result.content_version) throw new Error('version'); source.restored_from_version = restored; }
  else if (Object.hasOwn(raw,'restored_from_version')) throw new Error('version');
  if (raw.source === 'import') {
    if (full) { if (!Object.hasOwn(raw,'provenance')) throw new Error('provenance'); source = origins(raw,true); }
    else { const summary = object(raw.import_summary); source.import_summary = {source_note_id:uuid(summary.source_note_id),source_content_version:positive(summary.source_content_version)}; }
  } else if (['provenance','prior_provenance','import_summary'].some(k => Object.hasOwn(raw,k))) throw new Error('source');
  if (full) { const body = string(raw.body,20_000,1); if (!body.trim()) throw new Error('body'); return {...result,...source,note_id:uuid(raw.note_id),title:string(raw.title,200,1),body,sources:array(raw.sources,20).map(resultSource)}; }
  return {...result,...source};
}
/** @internal @param {unknown} value @param {string|null} id @returns {Record<string,unknown>} */
export function importResult(value,id) {
  const raw = object(value); const import_id = uuid(raw.import_id); if (id && id !== import_id) throw new Error('id');
  if (!['awaiting_upload','uploading','committed','cancelled','expired'].includes(/** @type {string} */(raw.status))) throw new Error('status');
  if (raw.status !== 'committed') return {import_id,status:raw.status,expires_at:date(raw.expires_at)};
  const mappings = array(raw.mappings,1000).map(v => { const item = object(v); return { source_note_id:uuid(item.source_note_id),note_id:uuid(item.note_id),content_version:positive(item.content_version) }; });
  const count = mappings.reduce((total,m) => total+m.content_version,0);
  if (raw.imported_notes !== mappings.length || raw.imported_versions !== count || count > 10_000 || new Set(mappings.map(m=>m.note_id)).size !== mappings.length || new Set(mappings.map(m=>m.source_note_id)).size !== mappings.length) throw new Error('counts');
  return { import_id,status:'committed',imported_at:date(raw.imported_at),imported_notes:raw.imported_notes,imported_versions:count,mappings,replayed:bool(raw.replayed) };
}
/** @internal @param {unknown} value @param {import('./errors.js').Operation} operation @param {number} status @param {RequestPlan} plan @returns {unknown} */
export function projectLifecycle(value,operation,status,plan) {
  const raw = object(value);
  if (operation === 'purgeNote' || operation === 'getNotePurge') {
    const purge_id = uuid(raw.purge_id); const note_id = uuid(raw.note_id);
    if ((operation === 'purgeNote' && note_id !== plan.id) || (operation === 'getNotePurge' && purge_id !== plan.id) || !['pending','completed'].includes(/** @type {string} */(raw.status))) throw new Error('purge');
    if ((operation === 'purgeNote' && status !== (raw.status === 'pending' ? 202 : 200)) || (raw.status === 'pending' && Object.hasOwn(raw,'completed_at'))) throw new Error('purge');
    return {purge_id,note_id,status:raw.status,requested_at:date(raw.requested_at),...(raw.status === 'completed' ? {completed_at:date(raw.completed_at)} : {})};
  }
  if (operation === 'createNote') return projectResult(value,'createNote',status,plan.limit,plan.id);
  if (['getNoteImport','cancelNoteImport','importNotes'].includes(operation ?? '')) return importResult(value,plan.id);
  if (operation === 'searchNotes' || operation === 'listNotes') {
    const old = projectResult(value,'searchNotes',status,plan.limit,null);
    const items = /** @type {import('./client.js').SearchNotesResult} */(old).items.map((item,index) => ({...item,...metadata(object(/** @type {unknown[]} */(raw.items)[index]),operation === 'searchNotes')}));
    return {items,has_more:bool(raw.has_more),...(Object.hasOwn(raw,'next_cursor') || operation === 'listNotes' ? pagination(raw) : {})};
  }
  if (operation === 'getNote' || operation === 'getTrashedNote') {
    const meta = metadata(raw,operation === 'getNote');
    if ((operation === 'getTrashedNote' && meta.state !== 'trashed') || (operation === 'getNote' && meta.state === 'trashed')) throw new Error('state');
    return {...projectResult(value,'getNote',status,plan.limit,plan.id),...meta,...origins(raw,false)};
  }
  if (operation === 'listNoteVersions' || operation === 'listTrashedNoteVersions') {
    if (uuid(raw.note_id) !== plan.id) throw new Error('id');
    const current = positive(raw.current_content_version); const items = array(raw.items,plan.limit).map(v => versionResult(object(v),false));
    if (items.some((v,i) => Number(v.content_version)>current || (i>0 && Number(items[i-1].content_version)<=Number(v.content_version)))) throw new Error('order');
    return {note_id:raw.note_id,current_revision:positive(raw.current_revision),current_content_version:current,items,...pagination(raw)};
  }
  if (operation === 'getNoteVersion' || operation === 'getTrashedNoteVersion') { const result = versionResult(raw,true); if (result.note_id !== plan.id || result.content_version !== plan.version) throw new Error('id'); return result; }
  if (uuid(raw.note_id) !== plan.id) throw new Error('id');
  return {note_id:raw.note_id,...metadata(raw),changed:bool(raw.changed),replayed:bool(raw.replayed)};
}
