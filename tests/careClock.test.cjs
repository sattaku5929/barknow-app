const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(relative) {
  const filename = path.join(__dirname, "..", relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(name => load(path.relative(path.join(__dirname, ".."), path.resolve(path.dirname(filename), `${name}.ts`))), module, module.exports);
  return module.exports;
}
const { careDate, careProgress, careUndoEntries, untilCareMidnight, subscribeCareDate } = load("lib/care/clock.ts");
assert.equal(careDate(new Date("2026-10-31T14:59:59Z")), "2026-10-31");
assert.equal(careDate(new Date("2026-10-31T15:00:00Z")), "2026-11-01");
assert.equal(untilCareMidnight(new Date("2026-10-31T14:59:59Z")), 1000);
assert.equal(untilCareMidnight(new Date("2026-10-31T15:00:00Z")), 86400000);
const completions = ["2026-10-25", "2026-10-26", "2026-10-31", "2026-11-01", "2026-11-02"].map(completedOn => ({ goalId: "a", completedOn }));
const goal = period => ({ id: "a", period });
assert.equal(careProgress(goal("day"), completions, "2026-10-31"), 1);
assert.equal(careProgress(goal("day"), completions, "2026-11-03"), 0);
assert.equal(careProgress(goal("week"), completions, "2026-11-01"), 3); // Sunday remains in the same week.
assert.equal(careProgress(goal("week"), completions, "2026-11-02"), 1); // Monday resets.
assert.equal(careProgress(goal("month"), completions, "2026-10-31"), 3);
assert.equal(careProgress(goal("month"), completions, "2026-11-01"), 1);
assert.equal(careProgress({ id: "other", period: "month" }, completions, "2026-11-01"), 0);
assert.equal(completions.length, 5, "rollover must preserve history");
// Exercise the actual subscription: midnight, mobile resume and cleanup.
const originals = { window: global.window, document: global.document, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
const timers = new Map(); const listeners = new Map(); let next = 0; let changes = 0;
const target = prefix => ({ addEventListener: (name, fn) => listeners.set(prefix + name, fn), removeEventListener: name => listeners.delete(prefix + name) });
try {
  global.window = target("window:"); global.document = target("document:");
  global.setTimeout = (fn, delay) => { assert.ok(delay > 0 && delay <= 86400000); timers.set(++next, fn); return next; };
  global.clearTimeout = id => timers.delete(id);
  const stop = subscribeCareDate(() => changes++);
  assert.equal(timers.size, 1);
  [...timers.values()][0](); assert.equal(changes, 1); assert.equal(timers.size, 1);
  for (const event of ["window:focus", "window:pageshow", "document:visibilitychange"]) listeners.get(event)();
  assert.equal(changes, 4); assert.equal(timers.size, 1);
  stop(); assert.equal(timers.size, 0); assert.equal(listeners.size, 0);
} finally { Object.assign(global, originals); }
console.log("Care rollover: Japan midnight, Monday/week/month boundaries, preserved history, resume and timer cleanup passed.");

const undoRows = [
  {id:"past",goalId:"a",completedOn:"2026-09-30",completedAt:"2026-09-30T10:00:00Z"},
  {id:"early",goalId:"a",completedOn:"2026-10-08",completedAt:"2026-10-08T01:00:00Z"},
  {id:"late",goalId:"a",completedOn:"2026-10-08",completedAt:"2026-10-08T02:00:00Z"},
  {id:"future",goalId:"a",completedOn:"2026-10-09",completedAt:"2026-10-09T01:00:00Z"},
  {id:"other",goalId:"b",completedOn:"2026-10-08",completedAt:"2026-10-08T03:00:00Z"},
];
for(const period of ["day","week","month"]) {
  const task={id:"a",period,targetCount:2};
  const undone=careUndoEntries(task,undoRows,"2026-10-08");
  assert.deepEqual(undone.map(item=>item.id),["late"]);
  const remaining=undoRows.filter(item=>!undone.includes(item));
  assert.equal(careProgress(task,remaining,"2026-10-08"),1);
  assert.deepEqual(remaining.map(item=>item.id),["past","early","future","other"]);
  assert.deepEqual(careUndoEntries({...task,targetCount:3},undoRows,"2026-10-08"),[]);
  assert.deepEqual(careUndoEntries({...task,targetCount:1},undoRows,"2026-10-08").map(item=>item.id),["late","early"]);
}
console.log("Care undo: newest completion, all periods, lowered targets and unrelated/history preservation passed.");
