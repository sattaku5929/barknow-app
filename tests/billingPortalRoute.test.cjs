const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const path = require("node:path");

function load(file, mocks, env = {}) {
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "process", code)(
    name => {
      if (!(name in mocks)) throw new Error("Unexpected module: " + name);
      return mocks[name];
    },
    module, module.exports, { env }
  );
  return module.exports;
}

const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const record = { stripe_customer_id: "cus_self", stripe_subscription_id: "sub_self" };

function verified({ row = record, subscription = null, databaseError = null } = {}) {
  let stripeReads = 0;
  const actual = subscription || { customer: "cus_self", metadata: { user_id: id }, status: "active", cancel_at_period_end: false };
  const api = load("lib/server/billing-subscription.ts", {
    "@/lib/server/supabase": {
      serviceSupabase: () => ({ from: table => {
        assert.equal(table, "wt_subscriptions");
        return { select: columns => {
          assert.equal(columns, "stripe_customer_id,stripe_subscription_id");
          return { eq: (field, value) => {
            assert.equal(field, "user_id"); assert.equal(value, id);
            return { maybeSingle: async () => ({ data: row, error: databaseError }) };
          } };
        } };
      } }),
    },
    "@/lib/server/stripe": { stripeClient: () => ({
      subscriptions: { retrieve: async () => { stripeReads++; return actual; } },
    }) },
  });
  return { run: () => api.verifiedBillingSubscription(id), reads: () => stripeReads };
}

test("only a paid contract with both IDs and correct Stripe owner is manageable", async () => {
  const active = verified();
  assert.deepEqual(await active.run(), { customerId: "cus_self", status: "active", cancelAtPeriodEnd: false });
  assert.equal(active.reads(), 1);
  const free = verified({ row: null });
  assert.equal(await free.run(), null);
  assert.equal(free.reads(), 0);
  const wrongCustomer = verified({ subscription: { customer: "cus_other", metadata: { user_id: id }, status: "active" } });
  assert.equal(await wrongCustomer.run(), null);
  const wrongAccount = verified({ subscription: { customer: "cus_self", metadata: { user_id: other }, status: "active" } });
  assert.equal(await wrongAccount.run(), null);
  const canceled = verified({ subscription: { customer: "cus_self", metadata: { user_id: id }, status: "canceled" } });
  assert.equal(await canceled.run(), null);
});

function route({ authenticated = true, subscription = { customerId: "cus_self", status: "active", cancelAtPeriodEnd: false }, configuration = { active: true, features: { subscription_cancel: { enabled: true } } }, configId = "bpc_test", failure = false } = {}) {
  const state = { portal: [], configurations: [], reads: 0 };
  const stripe = {
    billingPortal: {
      configurations: { retrieve: async id => { state.configurations.push(id); return configuration; } },
      sessions: { create: async options => { state.portal.push(options); return { url: "https://billing.stripe.com/p/session/test" }; } },
    },
  };
  const mod = load("app/api/billing/portal/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200, headers: init.headers }) } },
    "@/lib/server/supabase": { authenticatedUser: async () => authenticated ? { id } : null },
    "@/lib/server/stripe": { stripeClient: () => stripe },
    "@/lib/server/billing-subscription": { verifiedBillingSubscription: async userId => {
      assert.equal(userId, id); state.reads++;
      if (failure) throw Error("provider down");
      return subscription;
    } },
  }, { STRIPE_BILLING_PORTAL_CONFIGURATION_ID: configId, NEXT_PUBLIC_APP_URL: "https://barknow-app.vercel.app" });
  return { ...mod, state };
}
const request = { headers: { get: () => null } };

test("unauthenticated and non-subscriber requests never reach the portal", async () => {
  let r = route({ authenticated: false });
  assert.equal((await r.GET(request)).status, 401);
  assert.equal((await r.POST(request)).status, 401);
  assert.equal(r.state.reads, 0);
  r = route({ subscription: null });
  const get = await r.GET(request);
  assert.equal(get.status, 200);
  assert.equal(get.body.manageable, false);
  assert.equal(get.headers["Cache-Control"], "private, no-store");
  assert.equal((await r.POST(request)).status, 403);
  assert.equal(r.state.portal.length, 0);
});

test("valid paid account receives a customer-specific Stripe portal link", async () => {
  const r = route();
  assert.equal((await r.GET(request)).body.manageable, true);
  const response = await r.POST(request);
  assert.equal(response.status, 200);
  assert.match(response.body.url, /^https:\/\/billing\.stripe\.com\//);
  assert.equal(r.state.configurations[0], "bpc_test");
  assert.deepEqual(r.state.portal[0], {
    customer: "cus_self",
    configuration: "bpc_test",
    return_url: "https://barknow-app.vercel.app/",
    locale: "ja",
  });
});

test("portal without enabled cancellation fails closed", async () => {
  for (const config of [undefined, { active: false, features: { subscription_cancel: { enabled: true } } }, { active: true, features: { subscription_cancel: { enabled: false } } }]) {
    const r = route({ configId: config === undefined ? "" : "bpc_test", configuration: config });
    assert.equal((await r.POST(request)).status, 503);
    assert.equal(r.state.portal.length, 0);
  }
});

test("provider errors do not falsely mark users as paid or generate links", async () => {
  const r = route({ failure: true });
  assert.equal((await r.GET(request)).status, 503);
  assert.equal((await r.POST(request)).status, 503);
  assert.equal(r.state.portal.length, 0);
});

test("account deletion checks for uncancelled recurring contracts before deleting data", () => {
  const content = fs.readFileSync(path.join(__dirname, "../app/api/user/delete/route.ts"), "utf8");
  assert.match(content, /verifiedBillingSubscription\(user\.id\)/);
  assert.match(content, /activeContract && !activeContract\.cancelAtPeriodEnd/);
  assert.match(content, /status: 409/);
});
