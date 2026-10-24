const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const component = readFileSync("components/OperationAnnouncements.tsx", "utf8");
const stylesheet = readFileSync("app/globals.css", "utf8");

test("notification button uses a stroke icon instead of emoji", () => {
  assert.match(component, /className="operation-announcements-bell"[\s\S]*?<svg/);
  assert.doesNotMatch(component, /🔔/);
});
test("notification summaries have controlled expansion without changing admin editing", () => {
  assert.match(component, /expandedIds, setExpandedIds/);
  assert.match(component, /"operation-announcements-body is-collapsed"/);
  assert.match(component, /"もっと見る"/);
  assert.match(component, /aria-expanded={expandedIds\.includes\(item\.id\)}/);
  assert.match(component, /canManage \? <div className="operation-announcements-actions"/);
  assert.match(stylesheet, /-webkit-line-clamp:3/);
});
