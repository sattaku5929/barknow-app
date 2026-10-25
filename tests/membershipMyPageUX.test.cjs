const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("my page membership card goes to a dedicated plan page with no refresh button", () => {
  const card = read("components/owner/MembershipOverview.tsx");
  assert.match(card, /href="\/membership"/);
  assert.doesNotMatch(card, />\s*更新\s*</);
  assert.match(card, /\/api\/membership/);
});

test("membership page inspires upgrades but does not enable unapproved payments", () => {
  const page = read("app/membership/page.tsx");
  assert.match(page, /オンラインコーチング/);
  assert.match(page, /お申し込み準備中/);
  assert.doesNotMatch(page, /\/api\/stripe\/checkout|checkout\.sessions|window\.location\.assign/);
});

test("customer UI does not offer test push notifications", () => {
  const owner = read("app/page.tsx");
  const notification = read("components/owner/NotificationPreferences.tsx");
  assert.doesNotMatch(owner, /テスト通知を送る/);
  assert.doesNotMatch(notification, /テスト通知を送る|onTest/);
  assert.match(notification, /onDeviceToggle/);
  assert.match(notification, /通知の種類/);
});
