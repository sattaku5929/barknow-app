/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/entitlements.ts"), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleRef = { exports: {} };
new Function("require", "module", "exports", output)(
  name => { if (name === "@/lib/membership") return {}; throw Error("Unknown module " + name); },
  moduleRef, moduleRef.exports,
);
const { resolveOwnerEntitlements, membershipFeatureComparison } = moduleRef.exports;
const linkedCoach = { coachingStatus: "assigned", assignedCoachId: "coach-test-id", ownerConfirmedAt: "2026-10-25T00:00:00Z" };

test("free accounts can use core records, care, calendar and trends", () => {
  const result = resolveOwnerEntitlements({ membershipState: "standard" });
  assert.equal(result.tier, "free");
  assert.equal(result.availability, "upgrade_required");
  for (const key of ["dogProfile", "dailyCheck", "quickLog", "trends", "careAndCalendar", "coachingConsultationRequest"]) {
    assert.equal(result.features[key], true, key);
  }
  for (const key of ["dedicatedCoach", "coachChat", "onlineCoachingBooking"]) {
    assert.equal(result.features[key], false, key);
  }
});

test("a previously assigned coach does not alone confer paid entitlements", () => {
  const result = resolveOwnerEntitlements({ membershipState: "standard", ...linkedCoach });
  assert.equal(result.features.coachChat, false);
  assert.equal(result.features.onlineCoachingBooking, false);
});

test("paid users without a confirmed coach enter assignment waiting state", () => {
  for (const data of [
    {},
    { coachingStatus: "submitted", assignedCoachId: "coach-test-id", ownerConfirmedAt: "2026-10-25" },
    { coachingStatus: "assigned", assignedCoachId: "coach-test-id" },
    { coachingStatus: "offered", assignedCoachId: "coach-test-id", ownerConfirmedAt: "2026-10-25" },
    { ...linkedCoach, coachingStatus: "closed" },
  ]) {
    const result = resolveOwnerEntitlements({ membershipState: "active", ...data });
    assert.equal(result.tier, "paid");
    assert.equal(result.availability, "awaiting_coach");
    assert.equal(result.features.coachChat, false);
    assert.equal(result.features.onlineCoachingBooking, false);
  }
});

test("active paid membership AND confirmed coach enables chat and coaching", () => {
  for (const coachingStatus of ["assigned", "consulting", "payment_pending", "active"]) {
    const result = resolveOwnerEntitlements({ membershipState: "active", ...linkedCoach, coachingStatus });
    assert.equal(result.availability, "ready");
    assert.equal(result.features.dedicatedCoach, true);
    assert.equal(result.features.coachChat, true);
    assert.equal(result.features.onlineCoachingBooking, true);
  }
});

test("payment attention and ended membership do not grant new paid access", () => {
  for (const membershipState of ["payment_attention", "ended"]) {
    const result = resolveOwnerEntitlements({ membershipState, ...linkedCoach });
    assert.equal(result.tier, "free");
    assert.equal(result.features.coachChat, false);
    assert.equal(result.features.onlineCoachingBooking, false);
    assert.equal(result.features.dailyCheck, true);
  }
  assert.equal(resolveOwnerEntitlements({ membershipState: "payment_attention" }).availability, "payment_attention");
});

test("public comparison lists shared features and only three paid benefits", () => {
  const premium = membershipFeatureComparison.filter(x => !x.free && x.paid);
  assert.deepEqual(premium.map(x => x.key), ["dedicatedCoach", "coachChat", "onlineCoachingBooking"]);
  const free = resolveOwnerEntitlements({ membershipState: "standard" }).features;
  const paid = resolveOwnerEntitlements({ membershipState: "active", ...linkedCoach }).features;
  for (const row of membershipFeatureComparison) {
    assert.equal(free[row.key], row.free, row.key + " free");
    assert.equal(paid[row.key], row.paid, row.key + " paid");
  }
});

test("marketing page shows comparison but does not activate payments or block chat", () => {
  const page = fs.readFileSync(path.join(__dirname, "../app/membership/page.tsx"), "utf8");
  assert.match(page, /membershipFeatureComparison/);
  assert.match(page, /月額登録後に担当コーチが確定してから/);
  assert.doesNotMatch(page, /POST.*checkout\\.sessions|window\\.location\\.assign/);
  const chat = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");
  assert.ok(chat.includes("LockedCoachingPreview"));
  const api = fs.readFileSync(path.join(__dirname, "../app/api/online-sessions/book/route.ts"), "utf8");
  assert.match(api, /wt_book_online_session/);
});

test("Admin owner mode gets premium feature access without any subscription", () => {
  const data = resolveOwnerEntitlements({ membershipState: "standard", staffPremiumAccess: true, ...linkedCoach });
  assert.equal(data.tier, "paid");
  assert.equal(data.availability, "ready");
  assert.equal(data.features.coachChat, true);
  assert.equal(data.features.onlineCoachingBooking, true);
  const noCoach = resolveOwnerEntitlements({membershipState:"standard",staffPremiumAccess:true});
  assert.equal(noCoach.tier,"paid");
  assert.equal(noCoach.availability,"awaiting_coach");
  assert.equal(noCoach.features.coachChat,false);
  const missedPayment = resolveOwnerEntitlements({membershipState:"payment_attention",staffPremiumAccess:true,...linkedCoach});
  assert.equal(missedPayment.availability,"ready");
});
