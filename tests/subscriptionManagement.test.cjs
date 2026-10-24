/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function compile(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "process", "console", code)(
    name => { if (!(name in mocks)) throw new Error("Unexpected import " + name); return mocks[name]; },
    module, module.exports,
    { env: { NEXT_PUBLIC_APP_URL: "https://barknow-app.vercel.app" } },
    { error: () => {} },
  );
  return module.exports;
}

const userId = "owner-uuid-1";
const rows = { stripe_customer_id: "cus_TEST1234", stripe_subscription_id: "sub_TEST1234" };

function harness({ authenticated = true, dbRow = rows, stripeStatus = "active", stripeCustomer = "cus_TEST1234", error = null } = {}) {
  const calls = [];
  const subscription = { status: stripeStatus, customer: stripeCustomer, cancel_at_period_end: false };
  const stripe = {
    subscriptions: { retrieve: async id => { calls.push(["retrieve", id]); return subscription; } },
    billingPortal: { sessions: { create: async params => { calls.push(["portal", params]); return { url: "https://billing.stripe.com/p/session/test_abc" }; } } },
  };
  const admin = { from: name => {
    assert.equal(name, "wt_subscriptions");
    return { select: () => ({ eq: (key, value) => {
      assert.equal(key, "user_id"); assert.equal(value, userId);
      return { maybeSingle: async () => ({ data: dbRow, error }) };
    } }) };
  }};
  const api = compile("app/api/stripe/subscription/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options.status, headers: options.headers }) } },
    "@/lib/server/supabase": { authenticatedUser: async () => authenticated ? { id: userId } : null, serviceSupabase: () => admin },
    "@/lib/server/stripe": { stripeClient: () => stripe },
  });
  return { api, calls };
}

test("anonymous visitors cannot inspect or open portal", async () => {
  const h = harness({ authenticated: false });
  assert.equal((await h.api.GET({})).status, 401);
  assert.equal((await h.api.POST({})).status, 401);
  assert.equal(h.calls.length, 0);
});

test("non-subscribers do not receive a menu or portal", async () => {
  const h = harness({ dbRow: null });
  const response = await h.api.GET({});
  assert.equal(response.status, 200);
  assert.equal(response.body.eligible, false);
  assert.equal((await h.api.POST({})).status, 403);
  assert.equal(h.calls.length, 0);
});

test("active user's portal is created for their Stripe-verified customer only", async () => {
  const h = harness();
  const status = await h.api.GET({});
  assert.deepEqual(status.body, { eligible: true, status: "active", cancellationScheduled: false });
  assert.equal(status.headers["Cache-Control"], "private, no-store");
  const result = await h.api.POST({ json: async () => ({ customerId: "cus_ATTACKER" }) });
  assert.equal(result.status, 200);
  assert.ok(result.body.url.startsWith("https://billing.stripe.com/"));
  const portal = h.calls.find(call => call[0] === "portal");
  assert.equal(portal[1].customer, "cus_TEST1234");
  assert.ok(!h.calls.some(call => JSON.stringify(call).includes("cus_ATTACKER")));
});

test("mismatched Stripe customer cannot open portal", async () => {
  const h = harness({ stripeCustomer: "cus_ATTACKER" });
  assert.equal((await h.api.GET({})).status, 503);
  assert.equal((await h.api.POST({})).status, 503);
  assert.ok(!h.calls.some(call => call[0] === "portal"));
});

test("canceled contract cannot open portal as a current member", async () => {
  const h = harness({ stripeStatus: "canceled" });
  assert.equal((await h.api.GET({})).body.eligible, false);
  assert.equal((await h.api.POST({})).status, 403);
});

test("delete-account endpoint checks live Stripe status BEFORE deleting user data", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app/api/user/delete/route.ts"), "utf8");
  const query = source.indexOf('from("wt_subscriptions")');
  const stripe = source.indexOf("subscriptions.retrieve");
  const deletion = source.indexOf("listR2Keys(");
  assert.ok(query > 0 && stripe > query && deletion > stripe, "billing guard must execute first");
  assert.match(source, /status: 409/);
  assert.match(source, /継続課金が残っています/);
});

test("lifecycle webhooks exist for subscription cancellation and changes", () => {
  const webhook = fs.readFileSync(path.join(__dirname, "..", "app/api/stripe/webhook/route.ts"), "utf8");
  assert.match(webhook, /customer\.subscription\.updated/);
  assert.match(webhook, /customer\.subscription\.deleted/);
  assert.match(webhook, /stripe_subscription_id/);
  assert.match(webhook, /stripe_customer_id/);
});
