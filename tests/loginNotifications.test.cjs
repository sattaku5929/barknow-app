/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync(require("node:path").join(__dirname, "../app/page.tsx"), "utf8");
assert.ok(!source.includes("showPushPrompt"), "Login must not open a notification permission prompt");
assert.ok(!source.includes("new Notification("), "Browser timers must not duplicate server push or send reminders on login");
assert.ok(!source.includes("checkReminders("), "Care reminders are dispatched by the server scheduler");
console.log("Login notifications: no automatic permission prompt or browser reminder delivery; scheduled pushes are server-only.");
