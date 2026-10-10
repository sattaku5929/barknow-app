const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const {createClient} = require("@supabase/supabase-js");
const moduleObject = {exports:{}};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,"../lib/observations/recordedDays.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function("require","module","exports",code)(require,moduleObject,moduleObject.exports);
const {japanRecordDate,countRecordedDays,loadRecordedDays} = moduleObject.exports;
assert.equal(japanRecordDate("2026-10-09T14:59:59Z"),"2026-10-09");
assert.equal(japanRecordDate("2026-10-09T15:00:00Z"),"2026-10-10");
assert.equal(japanRecordDate("invalid"),null);
assert.equal(countRecordedDays([{occurred_at:"2026-10-09T15:00:00Z"},{occurred_at:"2026-10-10T01:00:00Z"}],[{recorded_on:"2026-10-10"},{recorded_on:"2026-10-01"}]),2);
let observations = Array.from({length:501},(_,i)=>({occurred_at:new Date(Date.UTC(2020,0,1+i,3)).toISOString()}));
const legacy = [{recorded_on:"2020-01-01"},{recorded_on:"2019-12-31"}];
let fail=false;const calls=[];
const client=createClient("https://test.invalid","publishable-test-key",{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{
  const parsed=new URL(url);calls.push({url:parsed,method:options.method});
  const offset=Number(parsed.searchParams.get("offset")||0);
  const rows=parsed.pathname.endsWith("wt_observation_entries")?observations:legacy;
  return new Response(JSON.stringify(fail?{message:"unavailable"}:rows.slice(offset,offset+500)),{status:fail?500:200,headers:{"Content-Type":"application/json"}});
}}});
(async()=>{
  assert.equal(await loadRecordedDays(client,"dog-a"),502,"all-time and page beyond 500 are counted");
  for(const call of calls){assert.equal(call.method,"GET");assert.equal(call.url.searchParams.get("dog_id"),"eq.dog-a");assert.equal(call.url.searchParams.get("order"),"id.asc");}
  const observationCalls=calls.filter(call=>call.url.pathname.endsWith("wt_observation_entries"));
  assert.equal(observationCalls.length,2);
  assert.equal(observationCalls[0].url.searchParams.get("entry_kind"),"in.(daily_check,event)");
  assert.equal(observationCalls[0].url.searchParams.get("deleted_at"),"is.null");
  assert.equal(observationCalls[1].url.searchParams.get("offset"),"500");
  observations=observations.slice(0,-1);assert.equal(await loadRecordedDays(client,"dog-a"),501,"last record deletion removes one day");
  observations[1]={occurred_at:observations[0].occurred_at};assert.equal(await loadRecordedDays(client,"dog-a"),500,"editing a date merges repeated dates");
  observations.push({occurred_at:"2026-10-10T00:00:00Z"});assert.equal(await loadRecordedDays(client,"dog-a"),501,"new record adds a day");
  calls.length=0;await loadRecordedDays(client,"dog-b");assert.ok(calls.every(call=>call.url.searchParams.get("dog_id")==="eq.dog-b"));
  fail=true;await assert.rejects(loadRecordedDays(client,"dog-a"),/unavailable/);
  // Real summary effect: refresh on resume, latest request wins, dog isolation,
  // and no fake zero on a failed read. No browser session or production writes.
  const React=require("react");
  let summaryState=null,effect,deps;const pending=[],listeners=new Map();
  const mockReact={...React,useState:()=>[summaryState,value=>{summaryState=value;}],useEffect:(fn,next)=>{effect=fn;deps=next;}};
  const componentModule={exports:{}};
  const componentCode=ts.transpileModule(fs.readFileSync(path.join(__dirname,"../components/owner/RecordedDaysSummary.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function("require","module","exports",componentCode)(name=>name==="react"?mockReact:name==="@/app/supabase"?{supabase:{}}:name==="@/lib/observations/recordedDays"?{loadRecordedDays:(_,dog)=>new Promise((resolve,reject)=>pending.push({dog,resolve,reject}))}:require(name),componentModule,componentModule.exports);
  const Summary=componentModule.exports.default;
  const originals={window:global.window,document:global.document};
  global.window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  global.document={visibilityState:"visible",addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const props={dogId:"dog-a",online:true,revision:"0:0",legacyRecords:[]};
  const count=element=>element.props.children[1].props.children[0];
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  try{
    assert.equal(count(Summary(props)),"—");assert.equal(deps[2],"0:0");assert.equal(deps[3],props.legacyRecords);
    let cleanup=effect();pending[0].resolve(2);await settle();assert.equal(count(Summary(props)),2);
    listeners.get("focus")();listeners.get("visibilitychange")();
    pending[2].resolve(7);await settle();pending[1].resolve(9);await settle();assert.equal(count(Summary(props)),7,"older resume requests cannot overwrite latest");
    listeners.get("focus")();cleanup();
    const dogB={...props,dogId:"dog-b",revision:"1:1",legacyRecords:[]};
    assert.equal(count(Summary(dogB)),"—","never show a previous dog's count");cleanup=effect();
    pending[3].resolve(99);pending[4].resolve(4);await settle();assert.equal(count(Summary(dogB)),4);
    listeners.get("focus")();pending[5].reject(new Error("offline"));await settle();assert.equal(count(Summary(dogB)),"—");
    assert.equal(count(Summary({...dogB,online:false})),"—");cleanup();assert.equal(listeners.size,0);
  }finally{Object.assign(global,originals);}
  console.log("Recorded days: Japan date boundaries, distinct dates, legacy union, full pagination, dog scope, create/edit/delete and read errors passed.");
})().catch(error=>{console.error(error);process.exitCode=1;});
