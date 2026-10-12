/* eslint-disable @typescript-eslint/no-require-imports -- Executes real handlers with controlled API clients. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.join(__dirname, '..');
function compile(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const compiled = {exports:{}};
  new Function('require','module','exports',code)(name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; },compiled,compiled.exports);
  return compiled.exports;
}
function routeHarness({conflict=true, rpcError=null, user=true}={}) {
  const calls = [], jobs = [];
  const client = {auth:{getUser:async()=>({data:{user:user?{id:'owner'}:null},error:null})},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{coach_id:'coach',starts_at:'2026-10-15T06:00:00Z',ends_at:'2026-10-15T07:00:00Z'},error:null})}),rpc:async(...args)=>{calls.push(args);return {data:'session',error:rpcError};}};
  const api = compile('app/api/online-sessions/book/route.ts', {'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})},after:fn=>jobs.push(fn)},'@/lib/server/supabase':{authenticatedSupabase:()=>client},'@/lib/server/google-calendar':{googleBusyRanges:async()=>conflict?[{start:'2026-10-15T06:15:00Z',end:'2026-10-15T06:45:00Z'}]:[],processCalendarSyncJobs:async()=>{}}});
  const post = allowGoogleConflict => api.POST({headers:{get:()=> 'Bearer token'},json:async()=>({applicationId:'application',slotId:'slot',sessionType:'initial',allowGoogleConflict})});
  return {calls,jobs,post};
}
const source = ts.createSourceFile('page.tsx',fs.readFileSync(path.join(root,'app/page.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const handlers = {};
function visit(node) {if(ts.isFunctionDeclaration(node)&&['bookOnlineSession','openStaffBooking'].includes(node.name?.text))handlers[node.name.text]=node;ts.forEachChild(node,visit);}
visit(source);
function handler(name, context) {const code=ts.transpileModule(handlers[name].getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function(...Object.keys(context),`${code};return ${name};`)(...Object.values(context));}
async function uiScenario(confirmConflict, code='GOOGLE_CALENDAR_CONFLICT') {
  const requests=[],busy=[],notices=[];let refreshed=0,prompts=0;
  const fn=handler('bookOnlineSession',{coachingApplication:{id:'application'},saving:false,onlineSessions:[],window:{confirm:()=>++prompts===1||confirmConflict},setSaving:v=>busy.push(v),showNotice:v=>notices.push(v),loadOwnerBookingWorkspace:async()=>{refreshed++;},authorizedFetch:async(_url,options)=>{requests.push(JSON.parse(options.body));return requests.length===1?{ok:false,status:409,json:async()=>({code,error:'conflict'})}:{ok:true,status:200,json:async()=>({sessionId:'session'})};}});
  await fn({id:'slot',startsAt:'2026-10-15T06:00:00Z'});return {requests,busy,notices,refreshed,prompts};
}
(async()=>{
  let h=routeHarness(),response=await h.post(false);assert.equal(response.status,409);assert.equal(response.body.code,'GOOGLE_CALENDAR_CONFLICT');assert.equal(h.calls.length,0);assert.equal(h.jobs.length,0);
  h=routeHarness();response=await h.post(true);assert.equal(response.status,200);assert.equal(h.calls[0][0],'wt_book_online_session');assert.equal(h.jobs.length,1);
  h=routeHarness();response=await h.post('true');assert.equal(response.status,409);assert.equal(h.calls.length,0);
  h=routeHarness({rpcError:{message:'already booked'}});response=await h.post(true);assert.equal(response.status,409);assert.equal(response.body.error,'already booked');assert.equal(h.jobs.length,0);
  h=routeHarness({conflict:false});assert.equal((await h.post(false)).status,200);
  h=routeHarness({user:false});assert.equal((await h.post(true)).status,401);assert.equal(h.calls.length,0);
  let ui=await uiScenario(false);assert.equal(ui.requests.length,1);assert.equal(ui.refreshed,0);assert.deepEqual(ui.busy,[true,false]);
  ui=await uiScenario(true);assert.equal(ui.requests.length,2);assert.equal(ui.requests[0].allowGoogleConflict,false);assert.equal(ui.requests[1].allowGoogleConflict,true);assert.equal(ui.refreshed,1);
  ui=await uiScenario(true,'OTHER_ERROR');assert.equal(ui.requests.length,1);assert.equal(ui.prompts,1);assert.equal(ui.refreshed,0);
  const state={};let scrolled=false,focused=false,loaded=false;
  handler('openStaffBooking',{setSelectedStaffSessionId:v=>state.id=v,setScheduleAnchor:v=>state.date=v,setScheduleMode:v=>state.mode=v,setScheduleOwnerFilter:v=>state.owner=v,setScheduleCoachFilter:v=>state.coach=v,window:{setTimeout:fn=>fn()},document:{getElementById:id=>{assert.equal(id,'staff-booking-detail');return {focus:()=>focused=true,scrollIntoView:()=>scrolled=true};}},loadStaffBookingWorkspace:()=>{loaded=true;}})({sessionId:'session',startsAt:'2026-10-15T15:30:00Z'});
  assert.deepEqual(state,{id:'session',date:'2026-10-16',mode:'day',owner:'all',coach:'all'});assert.ok(scrolled&&focused&&loaded);
  console.log('Booking overlap confirmation and staff booking detail handlers passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
