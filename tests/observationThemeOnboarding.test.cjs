/* eslint-disable @typescript-eslint/no-require-imports -- Execute the actual onboarding handler with a controlled persistence client. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const source = ts.createSourceFile("page.tsx",fs.readFileSync(path.join(__dirname,"../app/page.tsx"),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let save, onboarding;
function visit(node) {
  if(ts.isFunctionDeclaration(node)&&node.name?.text==="saveDogOnboarding")save=node;
  if(ts.isVariableDeclaration(node)&&node.name.getText(source)==="onboardingView")onboarding=node.initializer;
  ts.forEachChild(node,visit);
}
visit(source);
const state={};const navigation=[];
const context={
  profile:{name:"むぎ",breed:"トイプードル",concerns:"散歩",birthday:"2020-01-01",isFirstTimeOwner:"yes",gender:"male"},
  validateDogProfile:()=>({}),setDogProfileErrors:()=>{},focusFirstDogProfileError:()=>{},getUserId:async()=>"owner",
  setOnboardingError:()=>{},setSaving:value=>{state.saving=value;},
  supabase:{from(table){assert.equal(table,"wt_dogs");return {upsert(payload){state.payload=payload;return this;},select(){return this;},single:async()=>({data:{id:"dog"},error:null})};}},
  setProfile:value=>{state.profile=value;},writeLocal:(key,value)=>{state.local=value;},PROFILE_KEY:"profile",
  setOnboardingStep:value=>{state.step=value;},setOnboardingRequired:value=>{state.required=value;},
  returnToOwnerHome:()=>{navigation.push("home");},router:{replace:path=>navigation.push(path)},showNotice:value=>{state.notice=value;},
  getMissingSchemaColumn:()=>null,getSubmissionErrorDetail:error=>String(error),
};
const js=ts.transpileModule(save.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const handler=new Function(...Object.keys(context),`${js};return saveDogOnboarding;`)(...Object.values(context));
(async()=>{
  await handler({preventDefault(){}});
  assert.equal(state.step,"themes");assert.equal(state.profile.id,"dog");assert.equal(state.local.id,"dog");
  assert.equal(state.saving,false);assert.deepEqual(navigation,[],"save profile before selecting themes, then stay in onboarding");
  const text=onboarding.getText(source);
  assert.match(text,/onboardingStep === "themes"/);assert.match(text,/ObservationThemeSelector dogId=\{profile.id\}/);
  assert.match(text,/onSavingChange=\{setObservationThemesSaving\}/);assert.match(text,/disabled=\{observationThemesSaving\}/);
  console.log("Onboarding: saved dog ID reaches multi-theme selection before home; auto-save blocks the final continue button while in flight.");
})().catch(error=>{console.error(error);process.exitCode=1;});
