/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function fixture({ key = "sk_test_mock", price = {}, subscription = null, authenticated = true, payloadUser = "user-one", pendingStatus = "open" } = {}) {
  const calls = [];
  const stripe = {
    prices: { retrieve: async id => {
      calls.push(["price", id]);
      return { id, active: true, type: "recurring", currency: "jpy", unit_amount: 9800,
        recurring: { interval: "month" }, tax_behavior: "inclusive", livemode: false, ...price };
    }},
    subscriptions: { retrieve: async id => { calls.push(["subscription", id]); return { status: "active", customer: "cus_existing" }; } },
    checkout: { sessions: {
      create: async options => { calls.push(["checkout", options]); return { id: "cs_test_one", url: "https://checkout.stripe.com/c/pay/cs_test_one" }; },
      retrieve: async id => { calls.push(["retrieve-checkout", id]); return { id, status: pendingStatus, url: "https://checkout.stripe.com/c/pay/cs_test_one", client_reference_id: "user-one", metadata: { plan: "coaching" } }; },
      expire: async id => { calls.push(["expire-checkout", id]); return { id, status: "expired" }; },
    } },
  };
  const supabase = {
    authenticatedUser: async () => authenticated ? { id: "user-one", email: "owner@example.test" } : null,
    serviceSupabase: () => ({
      from: table => { assert.equal(table, "wt_subscriptions"); return {
        select: () => ({ eq: (column, uid) => {
          assert.equal(column, "user_id"); assert.equal(uid, "user-one");
          return { maybeSingle: async () => ({ data: subscription, error: null }) };
        } }),
        upsert: async (record, options) => { calls.push(["pending-upsert", record, options]); return { error: null }; },
      }; },
    }),
  };
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../app/api/stripe/checkout/route.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "process", "console", js)(
    name => {
      if (name === "next/server") return { NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) } };
      if (name === "@/lib/server/supabase") return supabase;
      if (name === "@/lib/server/stripe") return { stripeClient: () => stripe, coachingPriceId: () => "price_test_month" };
      throw Error("Unexpected module " + name);
    },
    mod, mod.exports,
    { env: { VERCEL_ENV: "preview", STRIPE_SECRET_KEY: key, NEXT_PUBLIC_APP_URL: "https://barknow-app.vercel.app" } },
    { error: () => {} },
  );
  const req = { nextUrl: { origin: "https://barknow-app.vercel.app" }, json: async () => ({ userId: payloadUser }) };
  return { api: mod.exports, req, calls };
}

test("unconfigured Stripe disables checkout and hides payment option", async () => {
  const h = fixture({ key: "" });
  assert.equal((await h.api.GET()).body.available, false);
  assert.equal((await h.api.POST(h.req)).status, 503);
  assert.equal(h.calls.some(v => v[0] === "checkout"), false);
});

test("live Stripe keys cannot be used by preview checkout", async () => {
  const h = fixture({ key: "sk_live_accidental" });
  assert.equal((await h.api.GET()).body.available, false);
  assert.equal((await h.api.POST(h.req)).status, 503);
});

test("invalid nonmonthly price blocks checkout", async () => {
  const h = fixture({ price: { recurring: { interval: "year" } } });
  assert.equal((await h.api.GET()).body.available, false);
  assert.equal((await h.api.POST(h.req)).status, 503);
});

test("public GET exposes verified price but not Stripe secret", async () => {
  const h = fixture();
  const data = (await h.api.GET()).body;
  assert.deepEqual(data, {
    available: true, monthlyAmount: 9800, currency: "jpy", taxBehavior: "inclusive", testMode: true,
  });
  assert.ok(!JSON.stringify(data).includes("sk_test"));
});

test("Stripe Checkout metadata is derived from authenticated user", async () => {
  const h = fixture();
  const result = await h.api.POST(h.req);
  assert.equal(result.status, 200);
  assert.equal(result.body.checkoutUrl.startsWith("https://checkout.stripe.com/"), true);
  const checkout = h.calls.find(v => v[0] === "checkout")[1];
  assert.equal(checkout.client_reference_id, "user-one");
  assert.equal(checkout.subscription_data.metadata.user_id, "user-one");
  assert.equal(checkout.mode, "subscription");
  assert.equal(checkout.line_items[0].price, "price_test_month");
  const record = h.calls.find(v => v[0] === "pending-upsert")[1];
  assert.equal(record.user_id, "user-one");
  assert.equal(record.plan_status, "inactive");
  assert.equal(record.stripe_checkout_session_id, "cs_test_one");
  assert.equal(record.stripe_subscription_id, null);
});

test("mismatched user ID and anonymous clients cannot start checkout", async () => {
  let h = fixture({ payloadUser: "other-user" });
  assert.equal((await h.api.POST(h.req)).status, 403);
  h = fixture({ authenticated: false });
  assert.equal((await h.api.POST(h.req)).status, 401);
});

test("existing active subscription blocks duplicate purchase", async () => {
  const h = fixture({ subscription: { stripe_customer_id: "cus_existing", stripe_subscription_id: "sub_existing" } });
  assert.equal((await h.api.POST(h.req)).status, 409);
  assert.equal(h.calls.some(v => v[0] === "checkout"), false);
});

test("open Checkout is reused and does not create duplicate subscriptions", async () => {
  const h = fixture({ subscription: { stripe_customer_id: null, stripe_subscription_id: null, stripe_checkout_session_id: "cs_existing" } });
  const result = await h.api.POST(h.req);
  assert.equal(result.status, 200);
  assert.equal(result.body.checkoutUrl.startsWith("https://checkout.stripe.com/"), true);
  assert.equal(h.calls.some(v => v[0] === "checkout"), false);
  assert.equal(h.calls.some(v => v[0] === "pending-upsert"), false);
});

test("completed Checkout cannot be duplicated while webhook is pending", async () => {
  const h = fixture({ subscription: { stripe_customer_id: null, stripe_subscription_id: null, stripe_checkout_session_id: "cs_existing" }, pendingStatus: "complete" });
  assert.equal((await h.api.POST(h.req)).status, 409);
  assert.equal(h.calls.some(v => v[0] === "checkout"), false);
});

test("expired pending Checkout can be restarted", async () => {
  const h = fixture({ subscription: { stripe_customer_id: null, stripe_subscription_id: null, stripe_checkout_session_id: "cs_existing" }, pendingStatus: "expired" });
  assert.equal((await h.api.POST(h.req)).status, 200);
  assert.equal(h.calls.some(v => v[0] === "checkout"), true);
});
