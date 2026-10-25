/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable -- CommonJS harness evaluates the real TSX modules. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.join(__dirname,"..");
let stored = [], fail = false, reads = 0;
const supabase = { from(table) {
  assert.equal(table,"wt_dog_observation_themes");
  const query = { action:"read", filters:{}, select(){return this;}, eq(key,value){this.filters[key]=value;return this;}, order(){return this;},
    insert(value){this.action="insert";this.value=value;return this;}, delete(){this.action="delete";return this;}, single(){return this.execute();},
    async execute() {
      if (fail) return {data:null,error:new Error("offline")};
      if(this.action==="insert") {const row={id:`id-${this.value.theme_key}`, ...this.value};stored.push(row);return {data:row,error:null};}
      if(this.action==="delete") {const found=stored.filter(r=>r.id===this.filters.id);stored=stored.filter(r=>r.id!==this.filters.id);return {data:found,error:null};}
      reads++;return {data:[...stored].sort((a,b)=>a.sort_order-b.sort_order),error:null};
    }, then(resolve,reject){return this.execute().then(resolve,reject);},
  };return query;
}};
function load(relative, react=React) {
  const code=ts.transpileModule(fs.readFileSync(path.join(root,relative),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  const localRequire=name=>name.endsWith(".module.css")?{default:new Proxy({},{get:(_,key)=>key})}:name.startsWith("./")?load(path.join(path.dirname(relative),`${name}.tsx`),react):name==="react"?react:name==="@/app/supabase"?{supabase}:name.startsWith("@/")?load(`${name.slice(2)}.ts`,react):require(name);
  new Function("require","module","exports",code)(localRequire,module,module.exports);return module.exports;
}
const {eventThemes,loadEventThemes}=load("lib/observations/observationEvent.ts");
function buttons(node) {if(!node||typeof node!=="object")return [];return [...(node.type==="button"?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(buttons)];}
function harness() {
  let cursor=0; const state=[], refs=[], effects=[];
  const hooks={...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==="function"?value(state[i]):value;}];},
    useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(fn){if(!effects.length)effects.push(fn);}};
  const Selector=load("components/observations/ObservationThemeSelector.tsx",hooks).default;
  const render=props=>{cursor=0;return Selector({dogId:"dog",online:true,...props});};
  return {render, mount:async()=>{effects[0]();await new Promise(setImmediate);}};
}
(async()=>{
  const h=harness();h.render();await h.mount();
  for(const theme of eventThemes) {
    const button=buttons(h.render()).find(b=>b.key===theme.key);assert.equal(button.props.disabled,false);
    await button.props.onClick();await new Promise(setImmediate);
  }
  assert.equal(stored.length,10);assert.deepEqual(stored.map(r=>r.sort_order),[1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(await loadEventThemes("dog"),eventThemes.map(t=>t.key));
  assert.ok(buttons(h.render()).every(b=>b.props["aria-pressed"]));
  const html=renderToStaticMarkup(h.render());assert.match(html,/10個選択中/);assert.doesNotMatch(html,/3つまで|\/ 3/);
  await buttons(h.render()).find(b=>b.key==="alone").props.onClick();await new Promise(setImmediate);
  assert.equal(stored.length,9);
  await buttons(h.render()).find(b=>b.key==="alone").props.onClick();await new Promise(setImmediate);
  assert.equal(stored.find(r=>r.theme_key==="alone").sort_order,3,"gap reuse avoids collisions");
  fail=true;await buttons(h.render()).find(b=>b.key==="walk").props.onClick();await new Promise(setImmediate);
  assert.equal(stored.length,10);assert.match(renderToStaticMarkup(h.render()),/保存できませんでした/);fail=false;
  assert.ok(buttons(h.render({online:false})).every(b=>b.props.disabled));
  const reload=harness();reload.render();await reload.mount();assert.ok(buttons(reload.render()).every(b=>b.props["aria-pressed"]));assert.ok(reads>=2);
  const Hub=load("components/observations/ObservationEventHub.tsx").default;
  const selected=await loadEventThemes("dog");let chosen,edited,configured=false;
  const entry={id:"event",themeKey:"walk",result:"success"};
  const props={selectedThemes:selected,events:[entry],compact:true,personalized:true,onSelect:key=>{chosen=key;},onEdit:e=>{edited=e;},onConfigureThemes:()=>{configured=true;}};
  const hub=Hub(props);const markup=renderToStaticMarkup(hub);
  assert.match(markup,/プロフィールで選んだ観察テーマ/);assert.match(markup,/今日 1件/);assert.doesNotMatch(markup,/ほかのできごとを記録/);
  assert.equal(buttons(hub).filter(b=>b.props["aria-label"]?.includes("を記録")).length,10);
  buttons(hub).find(b=>b.key==="grooming").props.onClick();assert.equal(chosen,"grooming");
  buttons(hub).find(b=>b.key==="event").props.onClick();assert.equal(edited,entry);
  buttons(hub).find(b=>b.props.children==="変更").props.onClick();assert.equal(configured,true);
  const sparse=Hub({...props,selectedThemes:["alone"]});
  assert.equal(buttons(sparse).filter(b=>b.props["aria-label"]?.includes("を記録")).length,1,"no unselected default themes among selected themes");
  assert.match(renderToStaticMarkup(sparse),/ほかのできごとを記録/);
  assert.match(renderToStaticMarkup(Hub({...props,selectedThemes:[]})),/観察テーマを選ぶと/);
  console.log("Observation themes UI: all selections auto-save/reload, deselect/reselect, failures/offline, selected-only home group, theme counts and record/configure actions passed.");
})().catch(error=>{console.error(error);process.exitCode=1;});
