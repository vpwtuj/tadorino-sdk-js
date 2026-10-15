import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,stat,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportToFile, importFromFile } from '../examples/express/archive-files.js';
import { TadorinoClient } from '../dist/index.js';
const id='11111111-1111-4111-8111-111111111111';const at='2026-10-15T00:00:00.000Z';
test('Node file example writes privately only on complete stream, refuses overwrite and removes partial files',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'tadorino-sdk-files-'));
 try {
  const target=path.join(dir,'archive.zip');const client=new TadorinoClient({baseUrl:'https://example.com',getAccessToken:()=> 'synthetic',fetch:()=>new Response(new Uint8Array([80,75,3,4]),{headers:{'Content-Type':'application/zip'}})});
  await exportToFile(client,{},target);assert.deepEqual([...await readFile(target)],[80,75,3,4]);assert.equal((await stat(target)).mode & 0o777,0o600);
  await assert.rejects(exportToFile(client,{},target));assert.deepEqual([...await readFile(target)],[80,75,3,4]);
  const failure=path.join(dir,'partial.zip');let emitted=false;
  const broken=new TadorinoClient({baseUrl:'https://example.com',getAccessToken:()=> 'synthetic',fetch:()=>new Response(new ReadableStream({pull(c){if(emitted)c.error(Error('synthetic interruption'));else{emitted=true;c.enqueue(new Uint8Array([80,75]));}}}),{headers:{'Content-Type':'application/zip'}})});
  await assert.rejects(exportToFile(broken,{},failure));await assert.rejects(stat(failure),{code:'ENOENT'});
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('Node import example reopens the same file and preserves the key on explicit retries',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'tadorino-sdk-import-'));
 try {
  const target=path.join(dir,'source.zip');await writeFile(target,new Uint8Array([80,75,3,4]));let keys=[];let bodies=[];
  const client=new TadorinoClient({baseUrl:'https://example.com',getAccessToken:()=> 'synthetic',fetch:async(_url,init)=>{if(init.method==='POST'){keys.push(JSON.parse(init.body).idempotency_key);return Response.json({import_id:id,status:'awaiting_upload',expires_at:at},{status:201});}bodies.push([...new Uint8Array(await new Response(init.body).arrayBuffer())]);return Response.json({import_id:id,status:'committed',imported_at:at,imported_notes:0,imported_versions:0,mappings:[],replayed:bodies.length>1});}});
  await importFromFile(client,target,id);await importFromFile(client,target,id);assert.deepEqual(keys,[id,id]);assert.deepEqual(bodies,[[80,75,3,4],[80,75,3,4]]);
 } finally {await rm(dir,{recursive:true,force:true});}
});
