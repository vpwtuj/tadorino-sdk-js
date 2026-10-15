import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { TadorinoClient, TadorinoError } from '../dist/index.js';
const id='11111111-1111-4111-8111-111111111111', key='22222222-2222-4222-8222-222222222222', importId='33333333-3333-4333-8333-333333333333';
const at='2026-10-15T00:00:00.000Z';
const meta={state:'active',revision:2,content_version:2,updated_at:at,state_changed_at:at};
const note={note_id:id,title:'原文',body:'## 合成\n 空白 🐈\n',sources:[{excerpt:'  保持\n'}],created_at:at,...meta};
const mutation={note_id:id,expected_revision:2,idempotency_key:key};
const receipt={note_id:id,...meta,changed:true,replayed:false};
const item={note_id:id,title:note.title,snippet:note.body,created_at:at,...meta};
const version={note_id:id,title:note.title,body:note.body,sources:note.sources,content_version:2,recorded_at:at,source:'restore',restored_from_version:1};
const versions={note_id:id,current_revision:2,current_content_version:2,items:[{content_version:2,recorded_at:at,source:'restore',restored_from_version:1}],has_more:false,next_cursor:null};
const prepared={import_id:importId,status:'awaiting_upload',expires_at:at};
const committed={import_id:importId,status:'committed',imported_at:at,imported_notes:1,imported_versions:2,mappings:[{source_note_id:id,note_id:key,content_version:2}],replayed:false};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const sdk=(fetch,options={})=>new TadorinoClient({baseUrl:'https://example.com',getAccessToken:()=> 'synthetic-token',fetch,...options});
const failure=(kind,operation)=>e=>{assert.ok(e instanceof TadorinoError);assert.equal(e.kind,kind);assert.equal(e.operation,operation);assert.ok(!JSON.stringify(e).includes('SECRET'));return true;};

for(const [name,input,path,method,body,result,status=200] of [
  ['listNotes',{state:'archived',limit:2,cursor:'opaque'},'/v1/notes/list','POST',{state:'archived',limit:2,cursor:'opaque'},{items:[item],has_more:true,next_cursor:'next'}],
  ['searchNotes',{query:'日本語',state:'active_and_archived',limit:2,cursor:'opaque'},'/v1/notes/search','POST',{query:'日本語',state:'active_and_archived',limit:2,cursor:'opaque'},{items:[item],has_more:false,next_cursor:null}],
  ['getNote',id,`/v1/notes/${id}`,'GET',undefined,note],
  ['getTrashedNote',id,`/v1/notes/${id}/trash`,'GET',undefined,{...note,state:'trashed',trashed_at:at,restore_state:'archived'}],
  ['updateNote',{...mutation,body:note.body,sources:[]},`/v1/notes/${id}`,'PATCH',{expected_revision:2,idempotency_key:key,body:note.body,sources:[]},receipt],
  ...['archive','unarchive','trash','restore'].map(action=>[`${action}Note`,mutation,`/v1/notes/${id}/${action}`,'POST',{expected_revision:2,idempotency_key:key},receipt]),
  ['listNoteVersions',{note_id:id,limit:2},`/v1/notes/${id}/versions/list`,'POST',{limit:2},versions],
  ['listTrashedNoteVersions',{note_id:id,cursor:'opaque'},`/v1/notes/${id}/trash/versions/list`,'POST',{cursor:'opaque'},versions],
  ['getNoteVersion',{note_id:id,version:2},`/v1/notes/${id}/versions/2`,'GET',undefined,version],
  ['getTrashedNoteVersion',{note_id:id,version:2},`/v1/notes/${id}/trash/versions/2`,'GET',undefined,version],
  ['restoreNoteVersion',{...mutation,version:1},`/v1/notes/${id}/versions/1/restore`,'POST',{expected_revision:2,idempotency_key:key},receipt],
  ['getNoteImport',importId,`/v1/note-imports/${importId}`,'GET',undefined,committed],
  ['cancelNoteImport',importId,`/v1/note-imports/${importId}/cancel`,'POST',{}, {...prepared,status:'cancelled'}],
  ['purgeNote',mutation,`/v1/notes/${id}/purge`,'POST',{expected_revision:2,idempotency_key:key},{purge_id:importId,note_id:id,status:'pending',requested_at:at},202],
  ['getNotePurge',importId,`/v1/note-purges/${importId}`,'GET',undefined,{purge_id:importId,note_id:id,status:'completed',requested_at:at,completed_at:at}],
]) test(`${name} uses the exact route and projects its public response`,async()=>{
  let calls=0;
  const client=sdk(async(url,init)=>{calls++;assert.equal(url,`https://example.com${path}`);assert.equal(init.method,method);assert.deepEqual(init.body===undefined?undefined:JSON.parse(init.body),body);assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');return json({...result,future:'SECRET'},status);});
  assert.deepEqual(await client[name](input),result);assert.equal(calls,1);
});

test('new inputs reject unknown fields, null, accessors and invalid IDs before token acquisition',async()=>{
  let calls=0;const client=sdk(()=>{calls++;throw Error('unexpected');},{getAccessToken:()=>{calls++;return 'token';}});
  for(const [method,input] of [
    ['updateNote',mutation],['updateNote',{...mutation,body:null}],['updateNote',{...mutation,title:'x',owner:id}],['updateNote',{...mutation,title:'x',expected_revision:0}],
    ['archiveNote',{...mutation,idempotency_key:'bad'}],['restoreNoteVersion',{...mutation,version:1.2}],['getNoteVersion',{note_id:id,version:'2'}],
    ['listNotes',{state:'all'}],['listNotes',{limit:undefined}],['listNoteVersions',{note_id:id,query:'x'}],
    ['exportNotes',{states:[]}],['exportNotes',{states:['active','active']}],['exportNotes',{note_ids:[id,id]}],['exportNotes',{include_history:null}],
    ['importNotes',{archive:new Uint8Array(),idempotency_key:key,source_note_ids:[]}],['importNotes',{archive:'zip',idempotency_key:key}],
    ['purgeNote',{...mutation,confirmed:true}],
  ]) await assert.rejects(client[method](input),failure('input',method));
  const getter={...mutation};Object.defineProperty(getter,'body',{enumerable:true,get(){throw Error('SECRET');}});await assert.rejects(client.updateNote(getter),failure('input','updateNote'));
  assert.equal(calls,0);
});

test('known lifecycle fields are mandatory for new methods and consistent with selected identities',async()=>{
  for(const value of [{...receipt,revision:0},{...receipt,state:'trashed'}, {...receipt,changed:null},{...receipt,note_id:key}]) await assert.rejects(sdk(()=>json(value)).updateNote({...mutation,title:'x'}),failure('invalid_response','updateNote'));
  for(const value of [{items:[item],has_more:true,next_cursor:null},{items:[{...item,content_version:null}],has_more:false,next_cursor:null}]) await assert.rejects(sdk(()=>json(value)).listNotes({}),failure('invalid_response','listNotes'));
  await assert.rejects(sdk(()=>json({...version,content_version:1})).getNoteVersion({note_id:id,version:2}),failure('invalid_response','getNoteVersion'));
  await assert.rejects(sdk(()=>json({...committed,imported_versions:1})).getNoteImport(importId),failure('invalid_response','getNoteImport'));
  await assert.rejects(sdk(()=>json({purge_id:importId,note_id:id,status:'completed',requested_at:at},200)).purgeNote(mutation),failure('invalid_response','purgeNote'));
});

test('new known error codes retain status without exposing arbitrary messages',async()=>{
  for(const [status,code] of [[409,'revision_conflict'],[410,'note_purged'],[400,'invalid_archive'],[422,'unsupported_archive_version'],[413,'import_too_large'],[409,'import_in_progress'],[409,'note_purge_pending']]) {
    await assert.rejects(sdk(()=>json({error:{code,message:'SECRET'}},status)).getNote(id),e=>failure('http','getNote')(e)&&e.status===status&&e.errorCode===code);
  }
});

test('import origin and history provenance are projected without modifying original text',async()=>{
  const origin={source_note_id:key,source_created_at:at,source_updated_at:at,source_state_changed_at:at,imported_at:at};
  const current={...note,import_origin:origin,prior_provenance:[origin]};
  assert.deepEqual(await sdk(()=>json({...current,import_origin:{...origin,future:'SECRET'}})).getNote(id),current);
  const provenance={source_note_id:key,source_content_version:1,source_recorded_at:at,source_operation:'create',imported_at:at};
  const imported={...version,source:'import',provenance,prior_provenance:[provenance]};delete imported.restored_from_version;
  assert.deepEqual(await sdk(()=>json({...imported,provenance:{...provenance,future:'SECRET'}})).getNoteVersion({note_id:id,version:2}),imported);
});

test('import uses one token, keeps exact bytes, and always uploads after a committed preparation',async()=>{
  for(const archive of [new Uint8Array([80,75,3,4,0,255]),new Blob([new Uint8Array([80,75,3,4,0,255])]),new ReadableStream({start(c){c.enqueue(new Uint8Array([80,75,3,4,0,255]));c.close();}})]) {
    let requests=0,tokens=0;
    const client=sdk(async(url,init)=>{
      requests++;assert.equal(new Headers(init.headers).get('authorization'),'Bearer one-token');
      if(requests===1){assert.equal(url,'https://example.com/v1/note-imports');assert.deepEqual(JSON.parse(init.body),{idempotency_key:key,source_note_ids:[id]});return json(committed);}
      assert.equal(url,`https://example.com/v1/note-imports/${importId}/archive`);assert.equal(init.method,'PUT');assert.equal(new Headers(init.headers).get('Content-Type'),'application/zip');
      assert.deepEqual([...new Uint8Array(await new Response(init.body).arrayBuffer())],[80,75,3,4,0,255]);return json({...committed,replayed:true});
    },{getAccessToken:()=>{tokens++;return 'one-token';}});
    assert.equal((await client.importNotes({archive,idempotency_key:key,source_note_ids:[id]})).replayed,true);assert.equal(requests,2);assert.equal(tokens,1);
    if(archive instanceof ReadableStream)await assert.rejects(client.importNotes({archive,idempotency_key:key}),failure('input','importNotes'));
  }
});

test('import deadline spans preparation and upload; preparation failures never upload',async t=>{
  let now=0;const timers=[];
  t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'setTimeout',(callback,delay)=>{timers.push({callback,delay});return 0;});
  let calls=0;let cancelled=false;
  const source=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}});
  const client=sdk(async(_url,init)=>{
    calls++;
    if(calls===1){now=8;return json(prepared,201);}
    assert.equal(now,8);assert.equal(timers.length,1);assert.equal(timers[0].delay,25);
    const reading=new Response(init.body).arrayBuffer();
    now=25;timers[0].callback();
    await reading;return json(committed);
  });
  await assert.rejects(client.importNotes({archive:source,idempotency_key:key},{timeoutMs:25}),failure('timeout','importNotes'));
  assert.equal(calls,2);assert.equal(cancelled,true);
  calls=0;await assert.rejects(sdk(()=>{calls++;return json({error:{code:'note_purged',message:'gone'}},410);}).importNotes({archive:new Blob(),idempotency_key:key}),failure('http','importNotes'));assert.equal(calls,1);
});

test('export deadline remains active after headers even when caller leaves the stream unread',async t=>{
  let now=0;const timers=[];
  t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'setTimeout',(callback,delay)=>{timers.push({callback,delay});return 0;});
  let cancelled=false;
  const client=sdk(()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/zip'}}));
  const result=await client.exportNotes({}, {timeoutMs:20});assert.equal(result.filename,'tadorino-export.zip');
  assert.equal(cancelled,false);assert.equal(timers.length,1);assert.equal(timers[0].delay,20);
  now=20;timers[0].callback();
  assert.equal(cancelled,true);await assert.rejects(result.stream.getReader().read(),failure('timeout','exportNotes'));
});

test('export handles EOF, actual-byte overflow, cancellation and interrupted bodies safely',async()=>{
  const good=await sdk(()=>new Response(new Uint8Array([80,75,0]),{headers:{'Content-Type':'application/zip'}})).exportNotes({states:['active'],include_history:true});
  assert.deepEqual([...new Uint8Array(await new Response(good.stream).arrayBuffer())],[80,75,0]);
  let cancelled=false;let chunks=0;let requestSignal;
  const oversized=new ReadableStream({pull(c){chunks++;c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}},{highWaterMark:0});
  const result=await sdk((_url,init)=>{requestSignal=init.signal;return new Response(oversized,{headers:{'Content-Type':'application/zip'}});}).exportNotes({});
  const reader=result.stream.getReader();await assert.rejects(async()=>{while(!(await reader.read()).done){}},failure('invalid_response','exportNotes'));assert.equal(cancelled,true);assert.equal(chunks,81);assert.equal(requestSignal.aborted,true);
  cancelled=false;const pending=await sdk(()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/zip'}})).exportNotes({});await pending.stream.cancel();assert.equal(cancelled,true);
  const interrupted=await sdk(()=>new Response(new ReadableStream({pull(c){c.error(Error('SECRET'));}}),{headers:{'Content-Type':'application/zip'}})).exportNotes({});await assert.rejects(interrupted.stream.getReader().read(),failure('network','exportNotes'));
});

test('export abort and destination failure cancel the source; successful HTTP cannot disguise malformed ZIP transport',async()=>{
  const abort=new AbortController();let cancelled=false;
  const result=await sdk(()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/zip'}})).exportNotes({}, {signal:abort.signal});abort.abort('SECRET');await assert.rejects(result.stream.getReader().read(),failure('aborted','exportNotes'));assert.equal(cancelled,true);
  cancelled=false;const sink=await sdk(()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array([1]));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/zip'}})).exportNotes({});await assert.rejects(sink.stream.pipeTo(new WritableStream({write(){throw Error('destination failed');}})));assert.equal(cancelled,true);
  for(const response of [json({}),new Response('x',{status:201,headers:{'Content-Type':'application/zip'}}),new Response('x',{headers:{'Content-Type':'application/zip','Content-Length':String(80*1024*1024+1)}})])await assert.rejects(sdk(()=>response).exportNotes({}),failure('invalid_response','exportNotes'));
});

test('Node native fetch uploads a bounded stream with duplex and reads the committed receipt',async()=>{
  let bytes=[];const server=createServer(async(req,res)=>{let chunks=[];for await(const chunk of req)chunks.push(chunk);if(req.method==='PUT')bytes=[...Buffer.concat(chunks)];res.writeHead(req.method==='POST'?201:200,{'Content-Type':'application/json'});res.end(JSON.stringify(req.method==='POST'?prepared:committed));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const client=new TadorinoClient({baseUrl:`http://127.0.0.1:${server.address().port}`,getAccessToken:()=> 'synthetic-token'});const result=await client.importNotes({archive:new ReadableStream({start(c){c.enqueue(new Uint8Array([80,75,3]));c.close();}}),idempotency_key:key});assert.equal(result.imported_notes,1);assert.deepEqual(bytes,[80,75,3]);}finally{await new Promise(r=>server.close(r));}
});

test('operation defaults and explicit timeout precedence are 60s JSON, 120s files, then client and call',async t=>{
 const real=globalThis.setTimeout;const delays=[];
 t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{delays.push(delay);return real(callback,delay,...args);});
 for(const [operation,input,options,clientOptions,expected] of [
  ['getNote',id,undefined,{},60_000],['exportNotes',{},undefined,{},120_000],['importNotes',{archive:new Uint8Array(),idempotency_key:key},undefined,{},120_000],
  ['exportNotes',{},undefined,{timeoutMs:999},999],['exportNotes',{}, {timeoutMs:1234},{timeoutMs:999},1234],
 ]){
  const before=delays.length;const result=await sdk((_url,init)=>operation==='getNote'?json(note):operation==='exportNotes'?new Response(new Uint8Array([80,75]),{headers:{'Content-Type':'application/zip'}}):json(init.method==='POST'?prepared:committed,init.method==='POST'?201:200),clientOptions)[operation](input,options);
  assert.ok(delays[before]<=expected&&delays[before]>=expected-100);if(operation==='exportNotes')await result.stream.cancel();
 }
});

test('import source errors and actual-byte overflow cancel the upload without retries',async()=>{
 for(const mode of ['error','oversize']){
  let cancelled=false,pulls=0,requests=0;const chunk=new Uint8Array(1024*1024);
  const archive=new ReadableStream({pull(c){pulls++;if(mode==='error')c.error(Error('SECRET'));else c.enqueue(chunk);},cancel(){cancelled=true;}},{highWaterMark:0});
  const client=sdk(async(_url,init)=>{requests++;if(init.method==='POST')return json(prepared,201);const reader=init.body.getReader();try{while(!(await reader.read()).done){}}finally{reader.releaseLock();}return json(committed);});
  await assert.rejects(client.importNotes({archive,idempotency_key:key}),failure(mode==='error'?'network':'input','importNotes'));
  assert.equal(requests,2);if(mode==='oversize'){assert.equal(cancelled,true);assert.equal(pulls,81);}
 }
});
