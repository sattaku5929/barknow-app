/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(pathname, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", pathname), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "console", code)(
    dep => { if (!(dep in mocks)) throw new Error("Unexpected dependency " + dep); return mocks[dep]; },
    mod, mod.exports, { error: () => {} },
  );
  return mod.exports;
}

const membership = load("lib/membership.ts", {});

test("all supported membership states are mapped consistently", () => {
  const statuses = [
    ["active_member", "active", true, "月額会員"],
    ["past_due", "payment_attention", false, "お支払いの確認が必要"],
    ["canceled", "ended", false, "契約終了"],
    ["inactive", "standard", false, "一般会員"],
    ["something-new", "standard", false, "一般会員"],
  ];
  for (const [input, state, entitled, label] of statuses) {
    const result = membership.membershipSummary({
      plan_status: input, activated_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T01:00:00Z",
    });
    assert.equal(result.state, state);
    assert.equal(result.hasActiveMembership, entitled);
    assert.equal(result.label, label);
    assert.equal(result.activatedAt, "2026-10-25T00:00:00Z");
  }
  assert.equal(membership.membershipSummary(null).state, "standard");
  assert.equal(membership.membershipSummary({ plan_status: null, activated_at: "invalid", updated_at: null }).activatedAt, null);
});

function harness({ loggedIn = true, row = null, databaseError = null, throwAuth = false } = {}) {
  const seen = [];
  const auth = async request => {
    seen.push(["auth", request.token]);
    if (throwAuth) throw new Error("authentication interrupted");
    return loggedIn ? { id: "user-verified-1" } : null;
  };
  const admin = {
    from: table => {
      assert.equal(table, "wt_subscriptions");
      return {
        select: fields => {
          assert.equal(fields, "plan_status,activated_at,updated_at");
          return { eq: (col, val) => {
            seen.push(["query", col, val]);
            return { maybeSingle: async () => ({ data: row, error: databaseError }) };
          } };
        },
      };
    },
  };
  const { GET } = load("app/api/membership/route.ts", {
    "next/server": { NextResponse: { json: (body, opts) => ({ body, status: opts.status, headers: opts.headers }) } },
    "@/lib/server/supabase": { authenticatedUser: auth, serviceSupabase: () => admin },
    "@/lib/membership": membership,
  });
  return { GET, seen };
}

test("unauthenticated request is rejected without database read", async () => {
  const h = harness({ loggedIn: false });
  const response = await h.GET({ token: null });
  assert.equal(response.status, 401);
  assert.ok(!h.seen.some(item => item[0] === "query"));
});

test("the server selects membership only using verified user ID", async () => {
  const h = harness({ row: { plan_status: "active_member", activated_at: "2026-10-25T00:00:00Z", updated_at: null } });
  const response = await h.GET({ token: "valid", user_id: "victim-id", nextUrl: { searchParams: new URLSearchParams("userId=victim-id") } });
  assert.equal(response.status, 200);
  assert.deepEqual(h.seen[1], ["query", "user_id", "user-verified-1"]);
  assert.equal(response.body.hasActiveMembership, true);
  assert.equal(response.body.state, "active");
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.ok(!JSON.stringify(response.body).includes("stripe"));
  assert.ok(!JSON.stringify(response.body).includes("victim-id"));
});

test("missing row is shown as standard, never as paid", async () => {
  const h = harness();
  const response = await h.GET({ token: "valid" });
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "standard");
  assert.equal(response.body.hasActiveMembership, false);
});

test("database failures do not pretend a free or paid status", async () => {
  const h = harness({ databaseError: new Error("database unavailable") });
  const response = await h.GET({ token: "valid" });
  assert.equal(response.status, 503);
  assert.ok(response.body.error);
  assert.ok(!("state" in response.body));
});

test("owner my page displays read-only membership and no payment actions", () => {
  const page = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");
  const component = fs.readFileSync(path.join(__dirname, "../components/owner/MembershipOverview.tsx"), "utf8");
  assert.match(page, /<MembershipOverview\s*\/>/);
  assert.match(component, /\/api\/membership/);
  assert.doesNotMatch(component, /stripe|checkout|billingPortal/i);
  assert.match(component, /契約管理・解約機能は準備中/);
});
