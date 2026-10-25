/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const owner = "11111111-1111-4111-8111-111111111111";
const dog = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const anotherDog = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const coach = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function load(relative, mocks) {
  const code = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "console", js)(
    name => { if (!(name in mocks)) throw Error("Unexpected dependency: " + name); return mocks[name]; },
    mod, mod.exports, { error: () => {} },
  );
  return mod.exports;
}
const membership = load("lib/membership.ts", {});
const policy = load("lib/entitlements.ts", {});
function setup({ signedIn = true, paid = false, dogId = dog,
  assignment = true, confirmed = true, status = "assigned",
  enforce = true, trial = null, broken = null, adminRole = false } = {}) {
  const seen = [];
  const results = {
    wt_user_roles: { data: { role: adminRole ? "admin" : "owner" }, error: null },
    wt_subscriptions: { data: paid ? { plan_status: "active_member" } : null, error: null },
    wt_coaching_applications: { data: dogId === dog ? {
      dog_id: dog, assigned_coach_id: coach, owner_confirmed_at: confirmed ? "2026-10-25T00:00:00Z" : null,
      status,
    } : null, error: null },
    wt_coaching_access_control: { data: { enforce_paid: enforce }, error: null },
    wt_coach_assignments: { data: assignment ? { id: "assignment-one" } : null, error: null },
    wt_coaching_trial_grants: { data: trial ? { expires_at: trial } : null, error: null },
  };
  if (broken) results[broken].error = { code: "DB_FAILURE", message: "Database unavailable" };
  const client = { from(table) {
    const filters = [];
    const query = {
      select: () => query,
      eq: (column, value) => { filters.push({ column, value }); return query; },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => { seen.push({ table, filters }); return results[table]; },
    };
    return query;
  } };
  const controller = load("app/api/membership/coaching-access/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200, headers: options?.headers }) } },
    "@/lib/server/supabase": { authenticatedUser: async () => signedIn ? { id: owner } : null, serviceSupabase: () => client },
    "@/lib/membership": membership,
    "@/lib/entitlements": policy,
  });
  const request = { nextUrl: { searchParams: new URLSearchParams("dogId=" + dogId) } };
  return { seen, results, request, ...controller };
}
test("unauthorized owners cannot fetch coaching access", async () => {
  const h = setup({ signedIn: false });
  assert.equal((await h.GET(h.request)).status, 401);
  assert.equal(h.seen.length, 0);
});
test("invalid or missing dog cannot be queried", async () => {
  const h = setup();
  assert.equal((await h.GET({ nextUrl: { searchParams: new URLSearchParams("") } })).status, 400);
  assert.equal((await h.GET({ nextUrl: { searchParams: new URLSearchParams("dogId=another") } })).status, 400);
});
test("only the signed-in owner and selected dog are queried", async () => {
  const h = setup({ paid: true });
  const result = await h.GET(h.request);
  assert.equal(result.status, 200);
  assert.equal(result.body.eligibleForChat, true);
  const app = h.seen.find(x => x.table === "wt_coaching_applications");
  assert.deepEqual(app.filters.filter(x => x.column === "owner_id" || x.column === "dog_id"),
    [{ column: "owner_id", value: owner }, { column: "dog_id", value: dog }]);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.ok(!JSON.stringify(result.body).includes("stripe"));
});
test("membership for a different dog never enables this dog's coaching access", async () => {
  const h = setup({ paid: true, dogId: anotherDog });
  const result = await h.GET(h.request);
  assert.equal(result.status, 200);
  assert.equal(result.body.eligibleForChat, false);
  assert.equal(result.body.availability, "awaiting_coach");
});
test("paid access requires confirmed matching coach assignment", async () => {
  for (const config of [{ paid: true, assignment: false }, { paid: true, confirmed: false },
    { paid: true, status: "closed" }]) {
    const h = setup(config);
    assert.equal((await h.GET(h.request)).body.eligibleForChat, false);
  }
});
test("trial access is temporary and requires a confirmed coach", async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  const valid = setup({ trial: future });
  const result = await valid.GET(valid.request);
  assert.equal(result.body.eligibleForChat, true);
  assert.equal(result.body.temporaryAccess, true);
  const expired = setup({ trial: past });
  assert.equal((await expired.GET(expired.request)).body.eligibleForChat, false);
  const unassigned = setup({ trial: future, assignment: false });
  assert.equal((await unassigned.GET(unassigned.request)).body.temporaryAccess, false);
});
test("db errors do not grant access", async () => {
  const h = setup({ broken: "wt_coaching_applications" });
  assert.equal((await h.GET(h.request)).status, 503);
});
test("before migration, API preserves enforcement disabled but reports planned eligibility", async () => {
  const h = setup();
  h.results.wt_coaching_access_control.error = { code: "PGRST205", message: "Could not find table wt_coaching_access_control" };
  const response = await h.GET(h.request);
  assert.equal(response.status, 200);
  assert.equal(response.body.enforcementActive, false);
});

test("verified Admin is premium without Stripe, only after matching coach confirmation", async () => {
  const approved = setup({ adminRole: true });
  const response = await approved.GET(approved.request);
  assert.equal(response.status, 200);
  assert.equal(response.body.staffPremiumAccess, true);
  assert.equal(response.body.tier, "paid");
  assert.equal(response.body.eligibleForChat, true);
  assert.equal(response.body.eligibleForBooking, true);
  assert.equal(response.body.temporaryAccess, false);
  assert.ok(!approved.seen.some(x=>x.table==="wt_coaching_trial_grants"));
  for (const config of [
    { adminRole: true, assignment: false },
    { adminRole: true, confirmed: false },
    { adminRole: true, status: "closed" },
    { adminRole: true, dogId: anotherDog },
  ]) {
    const attempt = setup(config);
    const result = await attempt.GET(attempt.request);
    assert.equal(result.body.staffPremiumAccess, true);
    assert.equal(result.body.eligibleForChat, false);
    assert.equal(result.body.eligibleForBooking, false);
    assert.equal(result.body.availability, "awaiting_coach");
  }
});
test("server role lookup is required and errors fail closed", async () => {
  const failure = setup({adminRole:true,broken:"wt_user_roles"});
  assert.equal((await failure.GET(failure.request)).status,503);
});
