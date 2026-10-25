/* eslint-disable @typescript-eslint/no-require-imports -- API harness */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
let staff=null,updates=[],readError=false,writeError=false;
const own='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const item={id:other,author_id:own,origin:'coach',format:'video',category:'トレーニング',tags:[],archived_at:null,blocked_at:null,sharing:'coaches'};
const database={from(){let payload;return {select(){return this;},eq(){return this;},update(p){payload=p;return this;},async maybeSingle(){if(payload){updates.push(payload);return {data:writeError?null:{id:other},error:writeError?{}:null};}return {data:readError?null:item,error:readError?{}:null};}};}};
const source=fs.readFileSync('app/api/content/items/route.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',js)(name=>name==='next/server'?{NextResponse:{json:(body,options={})=>({body,status:options.status??200})}}:name==='@/lib/server/supabase'?{authenticatedStaffRole:async()=>staff,serviceSupabase:()=>database}:name==='@/lib/r2'?{}:name==='@aws-sdk/client-s3'?{}:require(name),mod,mod.exports);
const request=id=>({json:async()=>({id})});
(async()=>{
const remove=mod.exports.DELETE;
assert.equal((await remove(request(other))).status,403);
staff={role:'coach',user:{id:other}};
assert.equal((await remove(request('invalid'))).status,400);
assert.equal((await remove(request(other))).status,403);assert.equal(updates.length,0);
staff={role:'coach',user:{id:own}};
const removed=await remove(request(other));assert.equal(removed.status,200);assert.equal(removed.body.deleted,true);
assert.ok(updates[0].archived_at);assert.equal(updates[0].archived_at,updates[0].blocked_at);
staff={role:'admin',user:{id:other}};assert.equal((await remove(request(other))).status,200);
writeError=true;assert.equal((await remove(request(other))).status,400);writeError=false;
readError=true;assert.equal((await remove(request(other))).status,503);
assert.match(source,/"トレーニング"/);assert.match(source,/\.in\("coach_id", authorIds\)/);
assert.match(source,/item.archived_at === item.blocked_at/);
console.log('Content management: deletion denied to unauthenticated/other coaches, owner/admin allowed, failures handled; training category and visible-author name lookup present.');
})().catch(e=>{console.error(e);process.exitCode=1;});
