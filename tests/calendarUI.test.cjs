const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
// Inspect the real owner-home composition, not only isolated child rendering.
// Care and calendar must remount on dog changes but cannot share a sibling key.
const ownerSource=ts.createSourceFile("page.tsx",fs.readFileSync(path.join(__dirname,"../app/page.tsx"),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let home;
function findHome(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ownerSource)==="focusedHomeView")home=node.initializer;ts.forEachChild(node,findHome);}
findHome(ownerSource);assert.ok(home,"owner home exists");
const homeKeys=[];
function findKeys(node){
  if(ts.isJsxSelfClosingElement(node)&&["HomeCareGroups","HomeCalendar"].includes(node.tagName.getText(ownerSource))){
    const key=node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(ownerSource)==="key");
    assert.ok(key?.initializer&&ts.isJsxExpression(key.initializer));
    homeKeys.push({name:node.tagName.getText(ownerSource),key:new Function("profile",`return (${key.initializer.expression.getText(ownerSource)});`)});
  }
  ts.forEachChild(node,findKeys);
}
findKeys(home);assert.equal(homeKeys.length,2,"one care root and one calendar in owner home");
for(const id of [undefined,"dog-a","dog-b"]){
  const keys=homeKeys.map(x=>x.key({id}));
  assert.equal(new Set(keys).size,keys.length,"home siblings must have distinct keys for every dog");
}
for(const component of homeKeys)assert.notEqual(component.key({id:"dog-a"}),component.key({id:"dog-b"}),"changing dogs still resets child state");
// Render the real components without replacing their UI. SSR must not issue reads/writes.
function load(relative) {
  const filename = path.join(__dirname,"..",relative);
  const code = ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{}};
  const localRequire = name => name.endsWith(".module.css") ? {__esModule:true,default:new Proxy({}, {get:(_,key)=>String(key)})} : name === "@/lib/care/model" ? load("lib/care/model.ts") : name === "./HomeCareEditor" ? load("components/owner/HomeCareEditor.tsx") : name === "@/lib/calendar/model" ? load("lib/calendar/model.ts") : name === "@/lib/calendar/service" ? new Proxy({}, {get:()=>()=>{throw new Error("Unexpected server-side database access");}}) : require(name);
  new Function("require","module","exports",code)(localRequire,module,module.exports);
  return module.exports;
}
const Care = load("components/owner/HomeCareGroups.tsx").default;
const Calendar = load("components/owner/HomeCalendar.tsx").default;
const careHtml = renderToStaticMarkup(React.createElement(Care,{goals:[{id:"day",period:"day",title:"歯磨き",targetCount:1},{id:"week",period:"week",title:"ブラッシング",targetCount:3}],progress:g=>g.id==="day"?1:2,onComplete:async()=>{},onManage:()=>{},icon:()=>null}));
for(const period of ["day","week","month"])assert.equal((careHtml.match(new RegExp(`data-care-period="${period}"`,"g"))||[]).length,1);
assert.match(careHtml,/歯磨き：今日1\/1回、完了/);assert.match(careHtml,/ブラッシング：今週2\/3回、できたを1回追加/);
assert.equal((careHtml.match(/>設定<\/button>/g)||[]).length,3);
assert.doesNotMatch(careHtml,/お世話の期間を選ぶ|home-care-panel|目標・お知らせの設定/);
const emptyCare=renderToStaticMarkup(React.createElement(Care,{goals:[],progress:()=>0,icon:()=>null}));
assert.equal((emptyCare.match(/>設定<\/button>/g)||[]).length,3);
const nineGoals=["day","week","month"].flatMap(period=>Array.from({length:3},(_,i)=>({id:`${period}-${i}`,period,title:`${period}項目${i}`,targetCount:1})));
const nineHtml=renderToStaticMarkup(React.createElement(Care,{goals:nineGoals,progress:()=>0,icon:()=>null}));
for(const period of ["day","week","month"]) {
  assert.equal((nineHtml.match(new RegExp(`data-care-period="${period}"`,"g"))||[]).length,1,"each period has exactly one card");
  assert.equal((nineHtml.match(new RegExp(`id="care-${period}-title"`,"g"))||[]).length,1);
}
assert.equal((nineHtml.match(/できたを1回追加/g)||[]).length,9,"retain all tasks inside three cards");
assert.equal((nineHtml.match(/>設定<\/button>/g)||[]).length,3);
for(const hint of ["毎日0時","毎週月曜0時","毎月1日0時"])assert.match(nineHtml,new RegExp(hint));
for(const count of [1,2,3,4,8,9,20,40]) {
  const goals=Array.from({length:count},(_,i)=>({id:String(i),title:`項目${i}`,period:"day",targetCount:1}));
  const html=renderToStaticMarkup(React.createElement(Care,{goals,templates:[],editable:true,progress:()=>0,onComplete:async()=>{},onCreate:async()=>true,onCountChange:async()=>{},onRemove:async()=>{},onManage:()=>{},icon:()=>null}));
  assert.match(html,new RegExp(`data-care-layout="${count<=3?"cards":count<=8?"tiles":"dense"}"`));
  assert.equal((html.match(/aria-label="項目\d+：/g)||[]).length,count,"all goals must be visible");
  assert.doesNotMatch(html,/もっと見る|保存中|今日のできたを/);
}
const Editor=load("components/owner/HomeCareEditor.tsx").default;
const editorHtml=renderToStaticMarkup(React.createElement(Editor,{period:"day",goals:[{id:"existing",title:"歯磨き",goalType:"teeth",period:"day",targetCount:2}],templates:[{title:"ブラッシング",period:"week",targetCount:3}],editable:true,progress:()=>1,icon:()=>null,onCreate:async()=>true,onCountChange:async()=>{},onRemove:async()=>{},onClose:()=>{}}));
assert.match(editorHtml,/追加する項目のアイコン/);assert.match(editorHtml,/歯磨きのアイコン/);
assert.equal((editorHtml.match(/type="radio"/g)||[]).length,64);
for(const label of ["散歩","ノーズワーク","予防接種","保育園","誕生日"])assert.match(editorHtml,new RegExp(label));
assert.match(editorHtml,/checked="" value="teeth"/);
assert.match(editorHtml,/毎日やることの設定/);assert.match(editorHtml,/歯磨きの目標回数/);assert.match(editorHtml,/min="1" max="31" step="1"/);assert.match(editorHtml,/やることを追加/);assert.match(editorHtml,/歯磨きを一覧から外す/);assert.match(editorHtml,/歯磨きのお知らせ時間/);
const calendarHtml = renderToStaticMarkup(React.createElement(Calendar,{dogId:"dog",dogName:"はな",birthday:"2020-10-07",online:false,today:"2026-10-07",refreshToken:"0",onRecord:()=>{throw new Error("Unexpected navigation");}}));
assert.match(calendarHtml,/愛犬とのカレンダー/); assert.match(calendarHtml,/はなちゃんの誕生日/);
assert.match(calendarHtml,/接続後に予定と記録を確認できます/);
assert.equal((calendarHtml.match(/aria-label="10月/g)||[]).length,7);
assert.match(calendarHtml,/aria-current="date"/); assert.match(calendarHtml,/予定・誕生日/); assert.match(calendarHtml,/できた・記録/);
assert.match(calendarHtml,/disabled=""[^>]*>＋ 予定/);
console.log("Calendar and care UI: actual SSR, period separation, correct counts, birthday, seven-day navigation, offline safety passed.");
