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
  const localRequire = name => name === "@/lib/calendar/model" ? load("lib/calendar/model.ts") : name === "@/lib/calendar/service" ? new Proxy({}, {get:()=>()=>{throw new Error("Unexpected server-side database access");}}) : require(name);
  new Function("require","module","exports",code)(localRequire,module,module.exports);
  return module.exports;
}
const Care = load("components/owner/HomeCareGroups.tsx").default;
const Calendar = load("components/owner/HomeCalendar.tsx").default;
const careHtml = renderToStaticMarkup(React.createElement(Care,{goals:[{id:"day",period:"day",title:"歯磨き",targetCount:1},{id:"week",period:"week",title:"ブラッシング",targetCount:3}],progress:g=>g.id==="day"?1:2,onComplete:async()=>{},onManage:()=>{},icon:()=>null}));
assert.match(careHtml,/毎日やること/); assert.match(careHtml,/今週中にやること/); assert.doesNotMatch(careHtml,/今月中にやること/);
assert.match(careHtml,/今日 1 \/ 1回/); assert.match(careHtml,/今週 2 \/ 3回/);
assert.match(careHtml,/歯磨き：目標達成/); assert.match(careHtml,/ブラッシング：できたを1回追加/);
const calendarHtml = renderToStaticMarkup(React.createElement(Calendar,{dogId:"dog",dogName:"はな",birthday:"2020-10-07",online:false,today:"2026-10-07",refreshToken:"0",onRecord:()=>{throw new Error("Unexpected navigation");}}));
assert.match(calendarHtml,/愛犬とのカレンダー/); assert.match(calendarHtml,/はなちゃんの誕生日/);
assert.match(calendarHtml,/接続後に予定と記録を確認できます/);
assert.equal((calendarHtml.match(/aria-label="10月/g)||[]).length,7);
assert.match(calendarHtml,/aria-current="date"/); assert.match(calendarHtml,/予定・誕生日/); assert.match(calendarHtml,/できた・記録/);
assert.match(calendarHtml,/disabled=""[^>]*>＋ 予定/);
console.log("Calendar and care UI: actual SSR, period separation, correct counts, birthday, seven-day navigation, offline safety passed.");
