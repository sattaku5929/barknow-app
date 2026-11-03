const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const text = fs.readFileSync(require("node:path").join(__dirname, "../app/page.tsx"), "utf8");
const source = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let home, record;
const functions = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "focusedHomeView") home = node.initializer;
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "recordView") record = node.initializer;
  if (ts.isFunctionDeclaration(node) && ["startEvent", "editEvent"].includes(node.name?.text)) functions[node.name.text] = node;
  ts.forEachChild(node, visit);
}
visit(source);
const elements = [];
function collect(node) {
  if (ts.isJsxSelfClosingElement(node)) elements.push(node);
  ts.forEachChild(node, collect);
}
collect(record);
const hub = elements.find(node => node.tagName.getText(source) === "ObservationEventHub");
const form = elements.find(node => node.tagName.getText(source) === "ObservationEventForm");
assert.ok(hub); assert.ok(form, "Record renders the existing event form");
const attribute = (node, name) => node.attributes.properties.find(p => p.name?.getText(source) === name);
assert.ok(attribute(hub, "compact"));
assert.ok(attribute(hub, "personalized"));
assert.match(attribute(hub, "disabled").initializer.expression.getText(source), /connection !== "online".*!profile.id.*eventStatus !== "ready"/);
const state = {}, navigations = [];
const context = {
  setRecordCategory: value => { state.category = value; },
  setEditingEvent: value => { state.editing = value; },
  setEventTheme: value => { state.theme = value; },
  navigateOwnerView: value => { navigations.push(value); },
  setSettingsPanel: value => { state.settings = value; },
  setEventRefresh: update => { state.refresh = update(state.refresh ?? 0); },
  showNotice: value => { state.notice = value; },
};
for (const name of ["startEvent", "editEvent"]) {
  const js = ts.transpileModule(functions[name].getText(source), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  context[name] = new Function(...Object.keys(context), `${js}; return ${name};`)(...Object.values(context));
}
function handler(node, name) {
  const callback = attribute(node, name).initializer.expression.getText(source);
  return new Function(...Object.keys(context), `return (${callback});`)(...Object.values(context));
}
handler(hub, "onSelect")("walk");
assert.equal(state.theme, "walk"); assert.equal(state.editing, null); assert.equal(navigations.at(-1), "record");
const entry = {id:"existing",themeKey:"barking"};
handler(hub, "onEdit")(entry);
assert.equal(state.editing, entry); assert.equal(state.theme, "barking"); assert.equal(navigations.at(-1), "record");
handler(hub, "onConfigureThemes")();
assert.equal(state.settings, "profile"); assert.equal(navigations.at(-1), "profile");
const before = navigations.length;
handler(form, "onSaved")();
assert.equal(state.refresh, 1); assert.equal(state.theme, null); assert.equal(state.editing, null);
assert.equal(state.notice, "記録しました"); assert.equal(navigations.length, before, "saving stays on Record");
handler(form, "onBack")(); assert.equal(state.theme, null);
context.startEvent("walk"); assert.equal(navigations.at(-1), "record", "existing record tab remains usable");
const homeText = home.getText(source);
assert.doesNotMatch(homeText, /コーチに相談する|navigateOwnerView\("coach"\)/);
assert.match(homeText, /goToRecordSection\("events"\)/); assert.match(text, /bottom-nav-record/);
assert.match(homeText, /home-plan-daily/); assert.match(homeText, /HomeCalendar/);
console.log("Home Quick Log routes to the existing Record hub/form; create/edit, save refresh, offline guard and existing navigation preserved.");
