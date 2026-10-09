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
function load(relative, reactOverride = React) {
  const filename = path.join(__dirname,"..",relative);
  const code = ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{}};
  const localRequire = name => name === "react" ? reactOverride : name === "./CalendarDays" ? load("components/owner/CalendarDays.tsx",reactOverride) : name.endsWith(".module.css") ? {__esModule:true,default:new Proxy({}, {get:(_,key)=>String(key)})} : name === "@/lib/care/model" ? load("lib/care/model.ts") : name === "./HomeCareEditor" ? load("components/owner/HomeCareEditor.tsx") : name === "@/lib/calendar/model" ? load("lib/calendar/model.ts") : name === "@/lib/calendar/service" ? new Proxy({}, {get:()=>()=>{throw new Error("Unexpected server-side database access");}}) : require(name);
  new Function("require","module","exports",code)(localRequire,module,module.exports);
  return module.exports;
}
const Care = load("components/owner/HomeCareGroups.tsx").default;
const Calendar = load("components/owner/HomeCalendar.tsx").default;
const careHtml = renderToStaticMarkup(React.createElement(Care,{goals:[{id:"day",period:"day",title:"歯磨き",targetCount:1},{id:"week",period:"week",title:"ブラッシング",targetCount:3}],progress:g=>g.id==="day"?1:2,onComplete:async()=>{},onManage:()=>{},icon:()=>null}));
for(const period of ["day","week","month"])assert.equal((careHtml.match(new RegExp(`data-care-period="${period}"`,"g"))||[]).length,1);
assert.match(careHtml,/歯磨き：今日1\/1回、完了、押すと未完了に戻す/);
assert.match(careHtml,/aria-pressed="true"/);
assert.doesNotMatch(careHtml,/<button[^>]*disabled[^>]*aria-label="歯磨き：/);assert.match(careHtml,/ブラッシング：今週2\/3回、できたを1回追加/);
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
for(const hint of ["毎日0時","毎週月曜0時","毎月1日0時"])assert.doesNotMatch(nineHtml,new RegExp(hint));
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
assert.equal((calendarHtml.match(/aria-label="10月/g)||[]).length,31);
assert.match(calendarHtml,/aria-current="date"/); assert.match(calendarHtml,/予定・誕生日/); assert.match(calendarHtml,/できた・記録/);
assert.match(calendarHtml,/disabled=""[^>]*>＋ 予定/);
console.log("Calendar and care UI: actual SSR, period separation, correct counts, birthday, month-first navigation, offline safety passed.");

// Actual date cells: custom titles, capped previews and expandable overflow.
const CalendarDays = load("components/owner/CalendarDays.tsx").default;
const calendarProps = {dates:["2026-10-07"],selected:"2026-10-07",today:"2026-10-07",birthday:"",records:[],mode:"month",onSelect:()=>{}};
const makePlans = count => Array.from({length:count},(_,i)=>({id:`plan-${i}`,title:`予定名${i}`,category:"other",start_date:"2026-10-07",end_date:"2026-10-07",start_time:null,location:"",note:""}));
for(const count of [0,1,2,3,8]) {
  const html=renderToStaticMarkup(React.createElement(CalendarDays,{...calendarProps,events:makePlans(count)}));
  assert.equal((html.match(/class="title"/g)||[]).length,Math.min(2,count));
  if(count>2)assert.match(html,new RegExp(`>＋${count-2}件<`));
  else assert.doesNotMatch(html,/class="more"/);
  assert.doesNotMatch(html,/plan-dot|>他</,"custom schedule titles replace category marks");
}
let expanded=null, chosen=null;
const interactiveGrid=load("components/owner/CalendarDays.tsx",{...React,useState:()=>[expanded,value=>{expanded=value;}]}).default;
const interactiveProps={...calendarProps,events:makePlans(4),onSelect:date=>{chosen=date;}};
let tree=interactiveGrid(interactiveProps);
let cell=tree.props.children[1][0];
cell.props.children[1].props.onClick();
assert.equal(chosen,"2026-10-07");
tree=interactiveGrid(interactiveProps);
let html=renderToStaticMarkup(tree);
assert.equal((html.match(/class="title"/g)||[]).length,4);
assert.match(html,/aria-expanded="true"/);assert.match(html,/>閉じる</);
assert.doesNotMatch(html,/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/,"no nested buttons");
cell=tree.props.children[1][0];cell.props.children[1].props.onClick();
html=renderToStaticMarkup(interactiveGrid(interactiveProps));
assert.equal((html.match(/class="title"/g)||[]).length,2);
assert.match(html,/>＋2件</);
const birthdayGrid=renderToStaticMarkup(React.createElement(CalendarDays,{...calendarProps,birthday:"2020-10-07",events:makePlans(2)}));
assert.match(birthdayGrid,/>誕生日</);assert.match(birthdayGrid,/>＋1件</);
console.log("Calendar titles: 0–8 plans, overflow expansion/collapse, selection, birthday and button semantics passed.");
// Exercise the real task button handler, including the in-flight tap lock.
(async()=>{
  const mockHooks={...React,useRef:value=>({current:value}),useState:value=>[value,()=>{}]};
  const InteractiveCare=load("components/owner/HomeCareGroups.tsx",mockHooks).default;
  const task={id:"toggle",title:"散歩",goalType:"walk",period:"day",targetCount:1};
  let count=0,added=0,undone=0,release;
  const props={goals:[task],templates:[],editable:true,icon:()=>null,progress:()=>count,
    onComplete:async()=>{added++;await new Promise(resolve=>{release=resolve;});count++;},onUndo:async()=>{undone++;count--;}};
  function taskButton(node){
    if(!node||typeof node!=="object")return null;
    if(node.type==="button"&&node.props["aria-label"]?.startsWith("散歩："))return node;
    for(const child of React.Children.toArray(node.props?.children)){const match=taskButton(child);if(match)return match;}
    return null;
  }
  let button=taskButton(InteractiveCare(props));assert.ok(button);assert.equal(button.props.disabled,false);
  button.props.onClick();button.props.onClick();assert.equal(added,1,"in-flight repeated tap cannot double count");
  release();await new Promise(resolve=>setImmediate(resolve));
  button=taskButton(InteractiveCare(props));assert.equal(button.props["aria-pressed"],true);assert.equal(button.props.disabled,false);
  button.props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(undone,1);assert.equal(count,0);
  button=taskButton(InteractiveCare(props));assert.equal(button.props["aria-pressed"],false);
  for(const period of ["week","month"]){count=3;const week={...task,period,targetCount:3};
    button=taskButton(InteractiveCare({...props,goals:[week]}));button.props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(count,2);}
  console.log("Home care actual handlers: complete, undo, repeat tap lock and weekly/monthly undo passed.");
})().catch(error=>{console.error(error);process.exitCode=1;});
