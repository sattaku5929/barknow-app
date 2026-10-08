const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const {createClient}=require("@supabase/supabase-js");
function load(file) {
  const code=ts.transpileModule(fs.readFileSync(require("node:path").join(__dirname,"../lib/care/",file),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};new Function("require","module","exports",code)(name=>name==="./model"?load("model.ts"):require(name),module,module.exports);return module.exports;
}
const {careLayout,careState,validTargetCount,careGoalError,careIconOptions}=load("model.ts");
const {createCareGoal,changeCareCount,changeCareIcon,archiveCareGoal}=load("mutations.ts");
const row={id:"goal",title:"歯磨き",goal_type:"teeth",target_count:2,period:"day",reminder_time:"19:00:00",created_at:"2026-10-01T00:00:00Z"};
const scope={ownerId:"owner",dogId:"dog"};
const calls=[];let failure=false;
const client=createClient("https://test.invalid","publishable-test-key",{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{
  calls.push({url:new URL(url),method:options.method,body:JSON.parse(options.body||"null")});
  return new Response(JSON.stringify(failure?{code:"PGRST116",message:"0 rows",details:"The result contains 0 rows"}:row),{status:failure?406:200,headers:{"Content-Type":"application/json"}});
}}});
(async()=>{
  assert.deepEqual([0,1,3,4,8,9,100].map(careLayout),["cards","cards","cards","tiles","tiles","dense","dense"]);
  for(const n of [0,32,-1,1.5,NaN,Infinity])assert.equal(validTargetCount(n),false);
  for(const n of [1,2,31])assert.equal(validTargetCount(n),true);
  assert.equal(careState("day",2,2),"完了");assert.equal(careState("week",2,2),"達成");assert.equal(careState("day",1,3),"1/3");
  const goal={id:"goal",title:" 歯磨き ",goalType:"teeth",targetCount:2,period:"day",reminderTime:"19:00",createdAt:row.created_at};
  assert.equal(careGoalError(goal),null);assert.ok(careGoalError({...goal,title:" "}));assert.ok(careGoalError({...goal,targetCount:1.5}));
  assert.equal(careIconOptions.length,32);
  for(const option of careIconOptions){
    const chosen={...goal,goalType:option.value};
    assert.equal(careGoalError(chosen),null);
    await createCareGoal(client,scope,chosen);assert.equal(calls.pop().body.goal_type,option.value);
    await changeCareCount(client,scope,"goal",2,"19:00",option.value);
    assert.deepEqual(calls.pop().body,{target_count:2,reminder_time:"19:00",goal_type:option.value});
  }
  await changeCareIcon(client,scope,"goal","nose");const iconChange=calls.pop();assert.deepEqual(iconChange.body,{goal_type:"nose"});
  for(const [field,value]of Object.entries({id:"eq.goal",owner_id:"eq.owner",dog_id:"eq.dog",active:"eq.true"}))assert.equal(iconChange.url.searchParams.get(field),value);
  await assert.rejects(changeCareIcon(client,scope,"goal","unknown"),/アイコン/);
  const beforeInvalidIcon=calls.length;await assert.rejects(changeCareCount(client,scope,"goal",2,null,"unknown"),/アイコン/);assert.equal(calls.length,beforeInvalidIcon);
  const result=await createCareGoal(client,scope,goal);assert.equal(result.reminderTime,"19:00");
  const create=calls.pop();assert.equal(create.method,"POST");assert.equal(create.body.id,"goal");assert.equal(create.body.title,"歯磨き");assert.equal(create.url.searchParams.get("on_conflict"),"id");
  await changeCareCount(client,scope,"goal",3);const change=calls.pop();assert.equal(change.method,"PATCH");assert.deepEqual(change.body,{target_count:3});
  await changeCareCount(client,scope,"goal",3,"08:30");assert.deepEqual(calls.pop().body,{target_count:3,reminder_time:"08:30"});
  await changeCareCount(client,scope,"goal",3,null);assert.deepEqual(calls.pop().body,{target_count:3,reminder_time:null});
  const beforeInvalidTime=calls.length;await assert.rejects(changeCareCount(client,scope,"goal",3,"25:90"),/時間/);assert.equal(calls.length,beforeInvalidTime);
  for(const [field,value]of Object.entries({id:"eq.goal",owner_id:"eq.owner",dog_id:"eq.dog",active:"eq.true"}))assert.equal(change.url.searchParams.get(field),value);
  await archiveCareGoal(client,scope,"goal");const archive=calls.pop();assert.equal(archive.method,"PATCH");assert.deepEqual(archive.body,{active:false});assert.ok(!calls.some(c=>c.method==="DELETE"));
  const before=calls.length;await assert.rejects(changeCareCount(client,scope,"goal",1.5),/整数/);assert.equal(calls.length,before);
  failure=true;await assert.rejects(changeCareIcon(client,scope,"goal","walk"),/保存できません/);await assert.rejects(changeCareCount(client,scope,"goal",2),/保存できません/);await assert.rejects(archiveCareGoal(client,scope,"goal"),/外せません/);await assert.rejects(createCareGoal(client,scope,goal),/追加できません/);
  console.log("Care goals: adaptive layouts, progress after count changes, validation, actual Supabase request scoping, history-preserving archive, zero-row/error handling passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
