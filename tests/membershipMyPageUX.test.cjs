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

test("Admin membership preview displays staff access without claiming a paid billing record", () => {
  const card=read("components/owner/MembershipOverview.tsx");
  const page=read("app/membership/page.tsx");
  const api=read("app/api/membership/route.ts");
  const owner=read("app/page.tsx");
  assert.match(card,/staffPremiumAccess \? "運営アカウント"/);
  assert.match(page,/staffPremiumAccess \? "運営アカウント"/);
  assert.match(api,/requireStaffRole\(user.id\)/);
  assert.match(owner,/userRole !== "owner" && userRole !== "admin"/);
  assert.doesNotMatch(api,/\.update\(|\.upsert\(|\.insert\(/);
});

test("operational Admin account is never sent to Stripe checkout", () => {
  const checkout=read("app/api/stripe/checkout/route.ts");
  assert.match(checkout,/requireStaffRole\(user.id\) === "admin"/);
  assert.match(checkout,/運営アカウントは有料機能を課金なしで利用できます/);
  assert.match(checkout,/status: 409/);
});

test("Admin owner sees coach assignment setup instead of a paid-plan upsell", () => {
  const app=read("app/page.tsx");
  assert.match(app,/staffPremiumAccess=\{userRole === "admin"\}/);
  assert.match(app,/owner-coaching-start/);
  assert.match(app,/staffPremiumAccess \? "担当コーチ確定後に利用可能"/);
  assert.match(app,/運営アカウントのご利用に月額料金は発生しません/);
});
