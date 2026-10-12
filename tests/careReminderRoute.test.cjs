/* eslint-disable @typescript-eslint/no-require-imports -- Execute the actual route with controlled database/push transports. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../app/api/care/reminders/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const id='00000000-0000-4000-8000-000000000001',token='00000000-0000-4000-8000-000000000002';
function harness({claimed=true,delivery='sent',pushError=false,claimError=false,finishError=false}={}){
  const state={claims:[],pushes:[],updates:[]},routeModule={exports:{}};
  const job={id,goal_id:'goal-id',owner_id:'owner-id',dog_id:'dog-id',reminder_on:'2026-10-12',title:'歯磨き',dog_name:'愛犬',claim_token:token};
  const admin={rpc:async(name,args)=>{state.claims.push({name,args});return {data:claimed?[job]:[],error:claimError?{}:null};},from:()=>({update:values=>{
    const filters=[];state.updates.push({values,filters});return {eq:(key,value)=>{filters.push([key,value]);return {eq:async(key,value)=>{filters.push([key,value]);return {error:finishError&&!!values.finished_at?{}:null};}};}};
  }})};
  new Function('require','module','exports','console',code)(name=>name==='next/server'?{NextResponse:{json:(body,init)=>({body,status:init?.status??200})}}:name==='@/lib/pushSender'?{sendPushNotification:async(...args)=>{state.pushes.push(args);if(pushError)throw Error('secret');return delivery;}}:{serviceSupabase:()=>admin},routeModule,routeModule.exports,{error(){}});
  return {state,post:(auth=`Bearer ${token}`,jobId=id)=>routeModule.exports.POST({headers:{get:()=>auth},json:async()=>({jobId,owner_id:'forged-owner',title:'forged-title'})})};
}
(async()=>{
  let h=harness();assert.equal((await h.post('')).status,401);assert.equal(h.state.claims.length,0);
  assert.equal((await h.post(undefined,'invalid')).status,400);
  h=harness();assert.equal((await h.post()).status,200);
  assert.deepEqual(h.state.claims[0],{name:'wt_claim_care_reminder',args:{target_job_id:id,target_delivery_token:token}});
  assert.deepEqual(h.state.pushes[0],['owner-id','WanTone｜毎日やること','愛犬の「歯磨き」の時間です。','/?view=goals',{kind:'care',tag:'care-goal-id-2026-10-12'}]);
  assert.equal(h.state.updates[0].values.delivery_status,'sent');assert.ok(h.state.updates[0].values.finished_at);
  assert.deepEqual(h.state.updates[0].filters,[['id',id],['claim_token',token]]);
  h=harness({claimed:false});assert.equal((await h.post()).status,200);assert.equal(h.state.pushes.length,0);
  h=harness({claimError:true});assert.equal((await h.post()).status,503);assert.equal(h.state.pushes.length,0);
  for(const delivery of ['unsubscribed','expired']){h=harness({delivery});assert.equal((await h.post()).status,200);assert.equal(h.state.updates[0].values.delivery_status,'skipped');}
  for(const options of [{pushError:true},{finishError:true}]){h=harness(options);assert.equal((await h.post()).status,502);assert.equal(h.state.updates.at(-1).values.claim_until,null);assert.equal(h.state.updates.at(-1).values.finished_at,undefined);assert.equal(h.state.updates.at(-1).values.last_error,'push_delivery_failed');}
  console.log('Care reminder API: capability auth, no client-selected recipients/content, private job data, successful/disabled/expired delivery, atomic acknowledgement and bounded-retry release passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
