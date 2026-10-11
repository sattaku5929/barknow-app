/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),path=require('node:path');
function compile(file,mocks,extra={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};new Function('require','module','exports','process','fetch',code)(name=>{if(!(name in mocks))throw Error('Unexpected import '+name);return mocks[name];},m,m.exports,extra.process??process,extra.fetch??fetch);return m.exports;
}
const json=(body,init)=>({body,status:init?.status??200,headers:init?.headers});
const id='00000000-0000-4000-8000-000000000001';
const cache=compile('lib/owner-cache.ts',{});
const stored=new Map([['private','previous account']]);
const storage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
assert.equal(cache.bindOwnerCache(storage,id,['private']),true);assert.equal(stored.has('private'),false);
stored.set('private','same-account offline record');
assert.equal(cache.bindOwnerCache(storage,id,['private']),false);assert.equal(stored.get('private'),'same-account offline record');
assert.equal(cache.bindOwnerCache(storage,'other-account',['private']),true);assert.equal(stored.has('private'),false);
const media=compile('lib/media-security.ts',{}, {process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co'}}});
assert.equal(media.validChatMediaKey(`chat/${id}/2026-10-11/photo.webp`),true);
for(const key of ['../private','chat/other/photo','chat/'+id+'/2026-10-11/../secret'])assert.equal(media.validChatMediaKey(key),false);
assert.equal(media.dogAvatarPath(`https://test.supabase.co/storage/v1/object/public/dog-avatars/${id}/avatar.webp?v=1`),`${id}/avatar.webp`);
assert.equal(media.dogAvatarPath(`https://evil.test/storage/v1/object/public/dog-avatars/${id}/avatar.webp`),null);
const push=compile('lib/push-security.ts',{});
for(const endpoint of ['https://fcm.googleapis.com/fcm/send/token','https://web.push.apple.com/token','https://updates.push.services.mozilla.com/wpush/v2/token','https://a.notify.windows.com/token'])assert.equal(push.validPushSubscription({endpoint,keys:{auth:'x',p256dh:'y'}}),true);
for(const endpoint of ['https://127.0.0.1/token','http://fcm.googleapis.com/token','https://fcm.googleapis.com.evil.test/token','https://evil.test/token','https://user:password@fcm.googleapis.com/token','https://fcm.googleapis.com:444/token'])assert.equal(push.validPushSubscription({endpoint,keys:{auth:'x',p256dh:'y'}}),false);
function mediaHarness({user=true,message=true,key=`chat/${id}/2026-10-11/photo.webp`}={}){
 const calls=[];
 const client={from:table=>{assert.equal(table,'wt_coach_messages');return {select:fields=>{assert.equal(fields,'media_key,media_type');return {eq:(column,value)=>{assert.equal(column,'id');assert.equal(value,id);return {maybeSingle:async()=>({data:message?{media_key:key,media_type:'image'}:null})};}};}};}};
 const api=compile('app/api/chat/media/route.ts',{'next/server':{NextResponse:{json}},'@/lib/server/supabase':{authenticatedUser:async()=>user?{id}:null,authenticatedSupabase:()=>client},'@/lib/r2':{r2BucketName:()=> 'private',r2Client:()=>({})},'@/lib/media-security':media,'@aws-sdk/client-s3':{GetObjectCommand:class{constructor(input){this.input=input;}}},'@aws-sdk/s3-request-presigner':{getSignedUrl:async(_client,command,options)=>{calls.push({command,options});return 'https://signed.test/limited';}}});return {api,calls};
}
(async()=>{
 const request={headers:{get:()=> 'Bearer token'},json:async()=>({messageId:id,key:'attacker-supplied'})};
 let h=mediaHarness({user:false});assert.equal((await h.api.POST(request)).status,401);assert.equal(h.calls.length,0);
 h=mediaHarness({message:false});assert.equal((await h.api.POST(request)).status,404);assert.equal(h.calls.length,0);
 h=mediaHarness({key:'../../private'});assert.equal((await h.api.POST(request)).status,404);assert.equal(h.calls.length,0);
 h=mediaHarness();const response=await h.api.POST(request);assert.equal(response.status,200);assert.equal(h.calls[0].options.expiresIn,300);assert.equal(response.headers['Cache-Control'],'private, no-store');assert.equal(h.calls[0].command.input.Key,`chat/${id}/2026-10-11/photo.webp`);
 let sends=[];
 const coaching=compile('app/api/coaching-notification/route.ts',{'next/server':{NextResponse:{json}},'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id,email:'private@example.test'}}})},from:()=>({select:()=>({eq:()=>({eq:()=>({single:async()=>({data:{id,owner_id:id,note:'SECRET',desired_outcome:'SECRET'}})})})})})})}}, {process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public',SLACK_COACHING_WEBHOOK_URL:'https://slack.test',RESEND_API_KEY:'private',COACHING_ADMIN_EMAIL:'admin@example.test'}},fetch:async(url,init)=>{sends.push({url,body:JSON.parse(init.body)});return {ok:true};}});
 const result=await coaching.POST({headers:{get:()=> 'Bearer token'},json:async()=>({applicationId:id}),nextUrl:{origin:'https://attacker.test'}});assert.equal(result.status,200);assert.equal(sends.length,2);
 for(const sent of sends){const body=JSON.stringify(sent.body);assert.ok(!body.includes('private@example.test'));assert.ok(!body.includes('SECRET'));assert.ok(!body.includes('attacker.test'));assert.ok(body.includes('https://barknow-app.vercel.app/'));}
 let updates=0;
 const stripeEvent={id:'evt_test',type:'checkout.session.completed',data:{object:{id:'cs_test',mode:'subscription',metadata:{plan:'coaching'},client_reference_id:id,customer:'cus_test',subscription:'sub_test'}}};
 const stripe=compile('app/api/stripe/webhook/route.ts',{'next/server':{NextResponse:{json}},'@/lib/server/supabase':{serviceSupabase:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})}),upsert:async()=>{updates++;return {error:null};}})})},'@/lib/server/stripe':{coachingPriceId:()=> 'price_test',stripeWebhookSecret:()=> 'test-secret',stripeClient:()=>({webhooks:{constructEvent:(_body,signature)=>{if(signature!=='valid')throw Error('invalid signature');return stripeEvent;}}})}}, {process:{env:{SLACK_COACHING_WEBHOOK_URL:'https://slack.test',RESEND_API_KEY:'private',ADMIN_EMAIL:'admin@example.test'}},fetch:async(url,init)=>{sends.push({url,body:JSON.parse(init.body)});return {ok:true};}});
 assert.equal((await stripe.POST({headers:{get:()=>null}})).status,400);
 const paymentResult=await stripe.POST({headers:{get:()=> 'valid'},text:async()=> 'signed-payload',nextUrl:{origin:'https://attacker.test'}});
 assert.equal(paymentResult.status,200);assert.equal(updates,1);assert.equal(sends.length,4);
 for(const sent of sends){assert.ok(!JSON.stringify(sent.body).includes('attacker.test'));assert.ok(!JSON.stringify(sent.body).includes('private@example.test'));}
 console.log('Security routes: private media, push SSRF defenses, account-cache isolation, notification privacy and payment processing passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
