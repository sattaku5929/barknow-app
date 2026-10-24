/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const owner = "00000000-0000-4000-8000-000000000001";
const checkout = {
  mode: "subscription", metadata: { plan: "coaching" },
  client_reference_id: owner, id: "cs_test_123",
  customer: "cus_MATCH", subscription: "sub_MATCH",
};
function harness({ checkoutData = {}, subscriptionData = {}, existing = null, eventType = "checkout.session.completed" } = {}) {
  const calls = [];
  const stripeSubscription = {
    id: "sub_MATCH", customer: "cus_MATCH", status: "active",
    metadata: { user_id: owner, plan: "coaching" },
    items: { data: [{ price: { id: "price_MATCH" } }] },
    ...subscriptionData,
  };
  const stripe = {
    webhooks: { constructEvent: payload => {
      calls.push({ operation: "verify-signature" });
      return { id: "evt_WEBHOOK", type: eventType, data: { object: JSON.parse(payload) } };
    } },
    subscriptions: { retrieve: async id => {
      calls.push({ operation: "retrieve", id });
      if (id === "sub_PREVIOUS") return { status: existing?.previousStatus || "active" };
      return stripeSubscription;
    } },
  };
  const admin = {
    from: name => {
      assert.equal(name, "wt_subscriptions");
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }),
        upsert: async (row, opts) => {
          calls.push({ operation: "upsert", row, opts });
          return { error: null };
        },
        update: row => ({
          eq: () => ({ eq: () => ({
            then: resolve => resolve({ error: null }),
          }) }),
        }),
      };
    },
  };
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../app/api/stripe/webhook/route.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "process", "console", output)(
    name => {
      if (name === "next/server") return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
      if (name === "@/lib/server/supabase") return { serviceSupabase: () => admin };
      if (name === "@/lib/server/stripe") return {
        stripeClient: () => stripe,
        stripeWebhookSecret: () => "whsec_TEST",
        coachingPriceId: () => "price_MATCH",
      };
      throw Error("Unknown module: " + name);
    },
    mod, mod.exports,
    { env: {} },
    { error: () => {}, warn: () => {} },
  );
  const object = eventType === "checkout.session.completed"
    ? { ...checkout, ...checkoutData }
    : { id: "sub_MATCH", customer: "cus_MATCH", ...stripeSubscription };
  const request = { headers: { get: key => key === "stripe-signature" ? "t=123,v1=mock" : null }, text: async () => JSON.stringify(object) };
  return { route: mod.exports, request, calls };
}

test("valid signed checkout activates only the expected price and owner", async () => {
  const h = harness();
  const result = await h.route.POST(h.request);
  assert.equal(result.status, 200);
  assert.equal(h.calls.filter(c => c.operation === "upsert").length, 1);
  const record = h.calls.find(c => c.operation === "upsert").row;
  assert.equal(record.user_id, owner);
  assert.equal(record.stripe_customer_id, "cus_MATCH");
  assert.equal(record.stripe_subscription_id, "sub_MATCH");
  assert.equal(record.stripe_price_id, "price_MATCH");
  assert.equal(record.plan_status, "active_member");
});

test("tampered checkout owner does not grant membership", async () => {
  const h = harness({ subscriptionData: { metadata: { user_id: "another-user", plan: "coaching" } } });
  const result = await h.route.POST(h.request);
  assert.equal(result.status, 400);
  assert.equal(h.calls.filter(c => c.operation === "upsert").length, 0);
});

test("wrong price does not grant membership", async () => {
  const h = harness({ subscriptionData: { items: { data: [{ price: { id: "price_OTHER" } }] } } });
  assert.equal((await h.route.POST(h.request)).status, 400);
  assert.equal(h.calls.filter(c => c.operation === "upsert").length, 0);
});

test("wrong Stripe customer does not grant membership", async () => {
  const h = harness({ subscriptionData: { customer: "cus_OTHER" } });
  assert.equal((await h.route.POST(h.request)).status, 400);
  assert.equal(h.calls.filter(c => c.operation === "upsert").length, 0);
});

test("second subscription cannot replace an existing active subscription", async () => {
  const h = harness({ existing: { stripe_event_id: "evt_OLD", stripe_subscription_id: "sub_PREVIOUS" } });
  assert.equal((await h.route.POST(h.request)).status, 409);
  assert.equal(h.calls.filter(c => c.operation === "upsert").length, 0);
});

test("replacement after the previous subscription ends is permitted", async () => {
  const h = harness({ existing: { stripe_event_id: "evt_OLD", stripe_subscription_id: "sub_PREVIOUS", previousStatus: "canceled" } });
  assert.equal((await h.route.POST(h.request)).status, 200);
  assert.equal(h.calls.filter(c => c.operation === "upsert").length, 1);
});

test("duplicate checkout webhook is idempotent", async () => {
  const h = harness({ existing: { stripe_event_id: "evt_WEBHOOK" } });
  const response = await h.route.POST(h.request);
  assert.equal(response.status, 200);
  assert.equal(response.body.duplicate, true);
  assert.equal(h.calls.filter(c => c.operation === "upsert").length, 0);
});

test("missing Stripe signature is not accepted", async () => {
  const h = harness();
  const response = await h.route.POST({ headers: { get: () => null } });
  assert.equal(response.status, 400);
  assert.equal(h.calls.length, 0);
});
