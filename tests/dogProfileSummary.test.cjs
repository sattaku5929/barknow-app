/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness executes real TSX handlers with a controlled persistence client. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const {renderToStaticMarkup} = require("react-dom/server");
const source = ts.createSourceFile("page.tsx", fs.readFileSync(path.join(__dirname,"../app/page.tsx"),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functions={},views={};
function visit(node) {
  if(ts.isFunctionDeclaration(node)&&node.name)functions[node.name.text]=node;
  if(ts.isVariableDeclaration(node)&&["profileSummaryView","profileView","profileEditorView","applyLayer"].includes(node.name.getText(source)))views[node.name.getText(source)]=node.initializer;
  ts.forEachChild(node,visit);
}
visit(source);
function handler(name,context) {
  const code=ts.transpileModule(functions[name].getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(...Object.keys(context),`${code};return ${name};`)(...Object.values(context));
}
const profile={id:"dog",avatarUrl:"",name:" むぎ ",breed:" トイプードル ",birthday:"2020-01-01",isFirstTimeOwner:"yes",gender:"male",trainingExperience:"first_time",daycareFrequency:"週1回",walkFrequency:"毎日2回",concerns:" 散歩中に吠える ",profileCompletedAt:"2026-01-01"};
function scenario({saveError=false,refreshError=false,invalid=false}={}) {
  const state={panel:"profile-edit",profile,reads:0,writes:0},ref={current:{...profile,name:"保存前"}};
  const context={profile,profileBeforeEditRef:ref,PROFILE_KEY:"profile",validateDogProfile:()=>invalid?{name:"名前を入力"}:{},setDogProfileErrors:errors=>{state.errors=errors;},focusFirstDogProfileError:()=>{},showNotice:text=>{state.notice=text;},setSaving:value=>{state.saving=value;},getUserId:async()=>"owner",persistedDogGender:gender=>gender,normalizeDogGender:gender=>gender,
    supabase:{from(table){assert.equal(table,"wt_dogs");return {select(){return this;},eq(){return this;},async maybeSingle(){state.reads++;return state.reads===1?{data:{gender:"male"},error:null}:{data:refreshError?null:{id:"dog",avatar_url:"",name:"保存されたむぎ",breed:"トイプードル",birth_date:"2020-01-01",is_first_time_owner:true,gender:"male",training_experience:"first_time",daycare_frequency:"週1回",walk_frequency:"毎日2回",concerns:"散歩中に吠える",profile_completed_at:"2026-01-01"},error:refreshError?new Error("refresh"):null};},async upsert(payload){state.writes++;state.payload=payload;return {error:saveError?new Error("save"):null};}};}},
    setProfile:value=>{state.profile=value;},writeLocal:(key,value)=>{state.local=value;},setConnection:value=>{state.connection=value;},setEventRefresh:update=>{state.refresh=update(state.refresh??0);},setSettingsPanel:value=>{state.panel=value;},closeAppHistoryLayer:(kind,fallback)=>{state.closed=kind;fallback();},scrollOwnerPageToTop:()=>{state.scrolled=true;},
  };return {state,ref,context};
}
function renderSummary(profileValue,themeState={}) {
  const context={profile:profileValue,eventThemesSelected:["walk","alone","meal","grooming"],eventStatus:"ready",eventThemes:[{key:"walk",label:"お散歩"},{key:"alone",label:"お留守番"},{key:"meal",label:"食事"},{key:"grooming",label:"ケア・お手入れ"}],closeSettingsPanel:()=>{},beginDogProfileEdit:()=>{},CareIcon:()=>React.createElement("svg"),ageLabel:()=>"6歳",dogGenderLabel:handler("dogGenderLabel",{}),trainingExperienceLabel:handler("trainingExperienceLabel",{}),...themeState};
  const code=ts.transpileModule(`return (${views.profileSummaryView.getText(source)});`,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const element=new Function("require","exports",...Object.keys(context),code)(require,{},...Object.values(context));
  return renderToStaticMarkup(element);
}
(async()=>{
  const ok=scenario();await handler("saveDogProfile",ok.context)({preventDefault(){}});
  assert.equal(ok.state.panel,"profile");assert.equal(ok.state.profile.name,"保存されたむぎ");assert.equal(ok.state.local.name,"保存されたむぎ");
  assert.equal(ok.ref.current,null);assert.equal(ok.state.saving,false);assert.equal(ok.state.refresh,1);assert.equal(ok.state.scrolled,true);
  const html=renderSummary(ok.state.profile);
  for(const label of ["保存されたむぎ","トイプードル","2020/01/01","男の子","なし","週1回","毎日2回","散歩中に吠える","お散歩","お留守番","食事","ケア・お手入れ","編集"])assert.ok(html.includes(label),label);
  assert.doesNotMatch(html,/<form|<input|<select|<textarea|愛犬プロフィールを保存/);
  assert.match(renderSummary({...profile,id:undefined,name:"",breed:""}),/登録する/);
  assert.match(renderSummary(profile,{eventThemesSelected:[]}),/観察テーマは未選択/);
  assert.match(renderSummary(profile,{eventStatus:"unavailable"}),/role="alert"/);
  for(const mode of ["menu","profile","profile-edit","owner","household","privacy"]){
    const context={settingsPanel:mode,settingsMenuView:"menu",profileSummaryView:"summary",profileEditorView:"editor",ownerProfileEditorView:"owner",householdView:"household",settingsDocumentView:"document"};
    const result=new Function(...Object.keys(context),`return ${views.profileView.getText(source)};`)(...Object.values(context));
    assert.equal(result,({menu:"menu",profile:"summary","profile-edit":"editor",owner:"owner",household:"household",privacy:"document"})[mode]);
  }
  const failed=scenario({saveError:true});await handler("saveDogProfile",failed.context)({preventDefault(){}});
  assert.equal(failed.state.panel,"profile-edit");assert.equal(failed.state.closed,undefined);assert.ok(failed.ref.current);assert.equal(failed.state.saving,false);
  const invalid=scenario({invalid:true});await handler("saveDogProfile",invalid.context)({preventDefault(){}});assert.equal(invalid.state.writes,0);assert.equal(invalid.state.panel,"profile-edit");
  const fallback=scenario({refreshError:true});await handler("saveDogProfile",fallback.context)({preventDefault(){}});assert.equal(fallback.state.panel,"profile");assert.equal(fallback.state.profile.name,"むぎ");
  const edit=scenario();edit.context.navigateSettingsPanel=value=>{edit.state.panel=value;};
  handler("beginDogProfileEdit",edit.context)();assert.equal(edit.state.panel,"profile-edit");assert.deepEqual(edit.ref.current,profile);
  edit.ref.current={...profile,name:"保存済み",avatarUrl:"saved-avatar"};handler("cancelDogProfileEdit",edit.context)();
  assert.equal(edit.state.panel,"profile");assert.equal(edit.state.profile.name,"保存済み");assert.equal(edit.state.profile.avatarUrl,"saved-avatar");assert.equal(edit.ref.current,null);
  const back=scenario();
  const applySource=ts.transpileModule(`const applyLayer=${views.applyLayer.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const apply=new Function(...Object.keys(back.context),`${applySource};return applyLayer;`)(...Object.values(back.context));
  apply({kind:"settings-panel",nextPanel:"profile-edit",previousPanel:"profile"},false);
  assert.equal(back.state.panel,"profile");assert.equal(back.state.profile.name,"保存前");
  console.log("Dog profile: saved server values visible read-only; edit/cancel/back routes; all fields/themes; save failures and validation stay in edit; refresh fallback passed.");
})().catch(error=>{console.error(error);process.exitCode=1;});
