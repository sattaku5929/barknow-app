const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
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
assert.match(careHtml,/毎日やること/); assert.match(careHtml,/今週中にやること/); assert.match(careHtml,/今月中にやること/);
assert.match(careHtml,/歯磨き：今日1\/1回、完了/); assert.match(careHtml,/ブラッシング：今週2\/3回、できたを1回追加/);
assert.match(careHtml,/毎日やることの目標・お知らせを設定/); assert.match(careHtml,/今週中にやることの目標・お知らせを設定/);
assert.equal((careHtml.match(/id="care-day-title"/g)||[]).length,1);assert.equal((careHtml.match(/id="care-week-title"/g)||[]).length,1);
assert.equal((careHtml.match(/aria-label="期間ごとのお世話"/g)||[]).length,1);assert.doesNotMatch(careHtml,/目標・お知らせの設定|class="manage"/);
const allPeriods=renderToStaticMarkup(React.createElement(Care,{goals:[{id:"d",title:"毎日項目",period:"day",targetCount:1},{id:"w",title:"週項目",period:"week",targetCount:1},{id:"m",title:"月項目",period:"month",targetCount:1}],progress:()=>0,icon:()=>null}));
for(const period of ["day","week","month"])assert.equal((allPeriods.match(new RegExp(`id="care-${period}-title"`,"g"))||[]).length,1);
assert.equal((allPeriods.match(/>設定<\/button>/g)||[]).length,3);
assert.equal((careHtml.match(/>設定<\/button>/g)||[]).length,3,"empty month keeps settings/add access");
for(const count of [1,2,3,4,8,9,20,40]) {
  const goals=Array.from({length:count},(_,i)=>({id:String(i),title:`項目${i}`,period:"day",targetCount:1}));
  const html=renderToStaticMarkup(React.createElement(Care,{goals,templates:[],editable:true,progress:()=>0,onComplete:async()=>{},onCreate:async()=>true,onCountChange:async()=>{},onRemove:async()=>{},onManage:()=>{},icon:()=>null}));
  assert.match(html,new RegExp(`data-care-layout="${count<=3?"cards":count<=8?"tiles":"dense"}"`));
  assert.equal((html.match(/aria-label="項目\d+：/g)||[]).length,count,"all goals must be visible");
  assert.doesNotMatch(html,/もっと見る|保存中|今日のできたを/);
}
const Editor=load("components/owner/HomeCareEditor.tsx").default;
const editorHtml=renderToStaticMarkup(React.createElement(Editor,{period:"day",goals:[{id:"existing",title:"歯磨き",period:"day",targetCount:2}],templates:[{title:"ブラッシング",period:"week",targetCount:3}],editable:true,progress:()=>1,icon:()=>null,onCreate:async()=>true,onCountChange:async()=>{},onRemove:async()=>{},onClose:()=>{}}));
assert.match(editorHtml,/毎日やることの設定/);assert.match(editorHtml,/歯磨きの目標回数/);assert.match(editorHtml,/min="1" max="31" step="1"/);assert.match(editorHtml,/やることを追加/);assert.match(editorHtml,/歯磨きを一覧から外す/);assert.match(editorHtml,/歯磨きのお知らせ時間/);
const calendarHtml = renderToStaticMarkup(React.createElement(Calendar,{dogId:"dog",dogName:"はな",birthday:"2020-10-07",online:false,today:"2026-10-07",refreshToken:"0",onRecord:()=>{throw new Error("Unexpected navigation");}}));
assert.match(calendarHtml,/愛犬とのカレンダー/); assert.match(calendarHtml,/はなちゃんの誕生日/);
assert.match(calendarHtml,/接続後に予定と記録を確認できます/);
assert.equal((calendarHtml.match(/aria-label="10月/g)||[]).length,7);
assert.match(calendarHtml,/aria-current="date"/); assert.match(calendarHtml,/予定・誕生日/); assert.match(calendarHtml,/できた・記録/);
assert.match(calendarHtml,/disabled=""[^>]*>＋ 予定/);
console.log("Calendar and care UI: actual SSR, period separation, correct counts, birthday, seven-day navigation, offline safety passed.");
