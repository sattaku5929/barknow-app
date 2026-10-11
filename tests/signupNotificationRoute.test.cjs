/* eslint-disable @typescript-eslint/no-require-imports -- Execute the real route with a controlled persistence/Slack transport. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/api/signup-notification/route.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const id='00000000-0000-0000-0000-000000000001',token='00000000-0000-0000-0000-000000000002';
function harness({claimed=true,status=200,networkError=false,updateError=false,signupWebhook="https://example.test/signup-webhook"}={}){
  const state={reads:0,calls:[],updates:[]},routeModule={exports:{}};
  const admin={rpc:async(name,args)=>{state.reads++;state.claim={name,args};return {data:claimed?[{id,user_id:id,created_at:'2026-10-11T12:00:00Z',claim_token:token}]:[]};},
    auth:{admin:{getUserById:async()=>({data:{user:{email:'<@everyone>&@example.test',is_anonymous:false}}})}},
    from:()=>({update:values=>{state.updates.push(values);return {eq:()=>({eq:async()=>({error:updateError?{}:null})})};}})};
  new Function('require','module','exports','fetch','process',code)(name=>name==='next/server'?{NextResponse:{json:(body,init)=>({body,status:init?.status??200})}}:{serviceSupabase:()=>admin},routeModule,routeModule.exports,
    async(url,init)=>{state.calls.push({url,init});if(networkError)throw new Error('secret-url');return {ok:status===200,status};},
    {env:{SLACK_SIGNUP_WEBHOOK_URL:signupWebhook,SLACK_COACHING_WEBHOOK_URL:'https://example.test/coaching-webhook'}});
  return {state,post:routeModule.exports.POST};
}
const req=(auth=`Bearer ${token}`,jobId=id)=>({headers:{get:()=>auth},json:async()=>({jobId})});
(async()=>{
  let h=harness();assert.equal((await h.post(req(''))).status,401);assert.equal(h.state.reads,0);
  assert.equal((await h.post(req(token))).status,401);assert.equal((await h.post(req(undefined,'invalid'))).status,400);
  assert.equal((await h.post(req())).status,200);assert.equal(h.state.calls.length,1);assert.equal(h.state.calls[0].url,'https://example.test/signup-webhook');
  const message=JSON.parse(h.state.calls[0].init.body);assert.match(JSON.stringify(message),/21:00/);assert.match(JSON.stringify(message),/&lt;@everyone&gt;&amp;/);
  assert.equal(message.blocks[1].fields[0].verbatim,true);assert.ok(h.state.updates[0].sent_at);
  for(const signupWebhook of [undefined,'','   ']){h=harness({signupWebhook:signupWebhook??''});assert.equal((await h.post(req())).status,503);assert.equal(h.state.reads,0);assert.equal(h.state.calls.length,0);assert.equal(h.state.updates.length,0);}
  h=harness({signupWebhook:'  https://example.test/signup-webhook  '});assert.equal((await h.post(req())).status,200);assert.equal(h.state.calls[0].url,'https://example.test/signup-webhook');
  h=harness({claimed:false});assert.equal((await h.post(req())).status,200);assert.equal(h.state.calls.length,0);
  for(const failure of [{status:500},{networkError:true}]){h=harness(failure);assert.equal((await h.post(req())).status,502);assert.equal(h.state.updates[0].claim_until,null);assert.equal(h.state.updates[0].sent_at,undefined);}
  h=harness({updateError:true});assert.equal((await h.post(req())).status,503);
  console.log('Signup route: unauthorized/invalid requests rejected; server data only, JST, Slack escaping, dedicated signup channel (no coaching fallback), missing config preserves attempts, dedup, failed sends retry and status errors passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
