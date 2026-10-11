const assert = require("node:assert/strict");
const fs = require("node:fs"), ts = require("typescript");
const source = ts.createSourceFile("page.tsx", fs.readFileSync(require("node:path").join(__dirname,"../app/page.tsx"),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect, dependencies;
function visit(node) {
  if(ts.isCallExpression(node) && node.expression.getText(source)==="useEffect" && node.arguments[0]?.getText(source).includes("const handleTouchStart")) {
    effect=node.arguments[0]; dependencies=node.arguments[1].getText(source);
  }
  ts.forEachChild(node,visit);
}
visit(source); assert.ok(effect);
for(const name of ["view","settingsPanel","ownerCoachTab"])assert.ok(dependencies.includes(name),"gesture handlers track the displayed screen");
const js=ts.transpileModule(`const effect=${effect.getText(source)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function run(view, options={}) {
  const listeners={},timers=[];
  let reloads=0;
  class Element { closest(){return null;} }
  const body={scrollTop:0},document={body,documentElement:{scrollTop:0}};
  const window={scrollY:0,location:{href:options.url??"https://barknow-app.vercel.app/?keep=yes#wan-tone-report",reload(){reloads++;}},
    history:{state:{retained:true},replaceState(state,_,url){assert.equal(state.retained,true);window.location.href=String(url);}},
    getComputedStyle:()=>({overflowY:"visible"}),setTimeout(fn,delay){timers.push({fn,delay});},
    addEventListener(name,fn){listeners[name]=fn;},removeEventListener(name){delete listeners[name];}};
  const context={window,document,HTMLElement:Element,authenticated:true,anonymousUser:false,onboardingRequired:false,
    view,settingsPanel:options.panel??"menu",ownerCoachTab:options.tab??"chat",
    pullStartRef:{current:{x:0,y:0}},pullDistanceRef:{current:0},pullActiveRef:{current:false},pullRefreshingRef:{current:false},
    setPullDistance(){},setPullRefreshing(){}};
  const cleanup=new Function(...Object.keys(context),`${js};return effect();`)(...Object.values(context));
  const target=new Element();
  listeners.touchstart({touches:[{clientX:0,clientY:0}],target});
  listeners.touchmove({touches:[{clientX:0,clientY:options.distance??200}],preventDefault(){}});
  listeners.touchend();
  timers.forEach(timer=>{assert.equal(timer.delay,320);timer.fn();});
  cleanup();assert.equal(Object.keys(listeners).length,0);
  return {url:new URL(window.location.href),reloads};
}
const home=run("home");assert.equal(home.reloads,1);assert.equal(home.url.hash,"#wan-tone-home");assert.equal(home.url.searchParams.get("keep"),"yes");
assert.equal(run("report").url.hash,"#wan-tone-report");
assert.equal(run("record").url.hash,"#wan-tone-record");
assert.equal(run("profile",{panel:"household"}).url.hash,"#wan-tone-settings-household");
assert.equal(run("coach",{tab:"sessions"}).url.hash,"#wan-tone-coach-sessions");
assert.equal(run("home",{url:"https://barknow-app.vercel.app/?view=coach&keep=yes#wan-tone-report"}).url.searchParams.has("view"),false);
assert.equal(run("home",{distance:50}).reloads,0,"short pulls do not reload");
console.log("Actual pull gesture: stale report URL becomes home before reload; current view/settings/coach tab, query preservation, old coach redirect removal and short pulls passed.");
