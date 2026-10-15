import { test, expect } from '@playwright/test';

test('packed lifecycle SDK and React TypeScript file helpers run in this browser',async({page,browser},testInfo)=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
   const {TadorinoClient}=await import('/node_modules/.vite/deps/@bright203_tadorino-sdk-js.js');
   const {prepareFileImport,importFile,prepareBodyUpdate,exportToDestination}=await import('/src/lifecycle.ts');
   const id='11111111-1111-4111-8111-111111111111',at='2026-10-15T00:00:00.000Z';
   let requests=0,tokens=0;const payload=[];const keys=[];
   const client=new TadorinoClient({baseUrl:'https://example.com',getAccessToken:()=>{tokens++;return 'synthetic-browser';},fetch:async(url,init)=>{
    requests++;
    if(url.endsWith('/export'))return new Response(new Uint8Array([80,75,3,4]),{headers:{'Content-Type':'application/zip'}});
    if(init.method==='PATCH')return Response.json({note_id:id,revision:2,content_version:2,state:'active',updated_at:at,state_changed_at:at,changed:true,replayed:false});
    if(init.method==='POST'){keys.push(JSON.parse(init.body).idempotency_key);return Response.json({import_id:id,status:'awaiting_upload',expires_at:at},{status:201});}
    payload.push([...new Uint8Array(await new Response(init.body).arrayBuffer())]);return Response.json({import_id:id,status:'committed',imported_at:at,imported_notes:0,imported_versions:0,mappings:[],replayed:payload.length>1});
   }});
   const edit=prepareBodyUpdate(id,1,'元の本文\n');const updated=await client.updateNote(edit);
   const pending=prepareFileImport(new File([new Uint8Array([80,75,3,4])],'source.zip',{type:'application/zip'}));
   await importFile(client,pending);await importFile(client,pending);
   let closed=false;const bytes=[];
   await exportToDestination(client,{},new WritableStream({write(chunk){bytes.push(...chunk);},close(){closed=true;}}));
   return {updated:updated.revision,keysSame:keys[0]===keys[1],payload,bytes,closed,requests,tokens};
 });
 expect(result).toEqual({updated:2,keysSame:true,payload:[[80,75,3,4],[80,75,3,4]],bytes:[80,75,3,4],closed:true,requests:6,tokens:4});
 testInfo.annotations.push({type:'browser-version',description:`${testInfo.project.name} ${browser.version()}; synthetic SDK file transport; real Auth0/PostgreSQL not tested`});
});

test('packed export deadline continues after response headers in browsers',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {TadorinoClient}=await import('/node_modules/.vite/deps/@bright203_tadorino-sdk-js.js');
  let cancelled=false;const client=new TadorinoClient({baseUrl:'https://example.com',getAccessToken:()=> 'synthetic',fetch:()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/zip'}})});
  const result=await client.exportNotes({},{timeoutMs:30});await new Promise(r=>setTimeout(r,60));
  try{await result.stream.getReader().read();return {kind:'unexpected',cancelled};}catch(error){return {kind:error.kind,cancelled};}
 });
 expect(result).toEqual({kind:'timeout',cancelled:true});
});

test('stream import is sent only when native Request supports streaming, with no buffer fallback',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {TadorinoClient}=await import('/node_modules/.vite/deps/@bright203_tadorino-sdk-js.js');
  let tokens=0,requests=0;const id='11111111-1111-4111-8111-111111111111',at='2026-10-15T00:00:00.000Z';
  const client=new TadorinoClient({baseUrl:'https://example.com',getAccessToken:()=>{tokens++;return 'synthetic';},fetch:async(_url,init)=>{requests++;if(init.method==='POST')return Response.json({import_id:id,status:'awaiting_upload',expires_at:at},{status:201});await new Response(init.body).arrayBuffer();return Response.json({import_id:id,status:'committed',imported_at:at,imported_notes:0,imported_versions:0,mappings:[],replayed:false});}});
  try{await client.importNotes({archive:new ReadableStream({start(c){c.enqueue(new Uint8Array([80,75]));c.close();}}),idempotency_key:id});return {kind:'supported',tokens,requests};}catch(error){return {kind:error.kind,tokens,requests};}
 });
 expect(result.kind==='supported'?result:{...result}).toEqual(result.kind==='supported'?{kind:'supported',tokens:1,requests:2}:{kind:'input',tokens:0,requests:0});
});
