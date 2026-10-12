/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the actual reminder effect with a controlled clock. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = fs.readFileSync(require("node:path").join(__dirname, "../app/page.tsx"), "utf8");
const file = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(file) === "useEffect" && node.arguments[0]?.getText(file).includes("function checkReminders(")) effect = node.arguments[0].getText(file);
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(effect);
assert.ok(!source.includes("showPushPrompt"), "Login must not open a notification permission prompt");
let now = "15:00", saved = {}, tick;
const notifications = [], notices = [];
class Notification {
  static permission = "granted";
  constructor(...args) { notifications.push(args); }
}
const window = { Notification, setInterval: (callback) => { tick = callback; return 1; }, clearInterval: () => { tick = undefined; } };
const code = ts.transpileModule(`const start = ${effect}; start();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const cleanup = new Function("authReady", "authenticated", "anonymousUser", "careGoals", "goalCompletions", "dogName", "currentTime", "readLocal", "REMINDER_SENT_KEY", "goalProgress", "today", "writeLocal", "showNotice", "window", "Notification", `${code.replace("start();", "return start();")}`)(
  true, true, false,
  [{ id: "past", reminderTime: "14:00", title: "過ぎた予定", targetCount: 1 }, { id: "future", reminderTime: "15:01", title: "次の予定", targetCount: 1 }, { id: "done", reminderTime: "15:01", title: "完了済み", targetCount: 1 }],
  [], "愛犬", () => now, () => saved, "reminders", (goal) => goal.id === "done" ? 1 : 0, () => "2026-10-12", (_key, value) => { saved = value; }, (message) => notices.push(message), window, Notification,
);
assert.equal(notifications.length, 0, "Login must not deliver overdue reminders");
assert.equal(notices.length, 0, "Login must not display an overdue reminder toast");
tick();
assert.equal(notifications.length, 0, "Overdue reminders must stay skipped on the next interval");
now = "15:01";
tick();
assert.equal(notifications.length, 1, "Upcoming incomplete goals must still notify while using the app");
assert.equal(notices.length, 1);
tick();
assert.equal(notifications.length, 1, "Do not repeat a reminder already delivered today");
cleanup();
assert.equal(tick, undefined);
console.log("Login notifications: no automatic permission prompt or overdue reminders; upcoming reminders, completed-goal exclusion and dedup passed.");
