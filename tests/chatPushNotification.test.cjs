/* eslint-disable @typescript-eslint/no-require-imports -- Run real routes/service worker with controlled transports. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function compile(file, mocks) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const routeModule = { exports: {} };
  new Function("require", "module", "exports", "console", code)((name) => {
    assert.ok(name in mocks, `Unexpected import: ${name}`);
    return mocks[name];
  }, routeModule, routeModule.exports, { error() {}, warn() {} });
  return routeModule.exports;
}

const json = (body, init) => ({ body, status: init?.status ?? 200 });
function chatHarness({ sender = "owner", authenticated = true, saveError = false, pushError = false, lookupError = false, coachId = "coach-id" } = {}) {
  const state = { pushes: [], tasks: [], inserts: [], lookups: [] };
  const userId = sender === "owner" ? "owner-id" : "coach-id";
  const admin = { from: (table) => {
    const filters = [];
    const query = {
      select: () => query,
      eq: (key, value) => { filters.push([key, value]); return query; },
      maybeSingle: async () => {
        state.lookups.push({ table, filters });
        if (lookupError) throw new Error("lookup failed");
        return { data: table === "wt_coach_assignments" ? (coachId ? { coach_id: coachId } : null)
          : table === "wt_owner_profiles" ? { full_name: "飼い主" } : { display_name: "コーチ" }, error: null };
      },
    };
    return query;
  } };
  const client = { from: () => ({ insert: (message) => {
    state.inserts.push(message);
    return { select: () => ({ single: async () => ({ data: { ...message, id: "message-id" }, error: saveError ? { message: "denied" } : null }) }) };
  } }) };
  const route = compile("app/api/chat/messages/route.ts", {
    "next/server": { NextResponse: { json }, after: (callback) => state.tasks.push(callback) },
    "@/lib/pushSender": { sendPushNotification: async (...args) => { state.pushes.push(args); if (pushError) throw new Error("push failed"); } },
    "@/lib/server/supabase": { authenticatedUser: async () => authenticated ? { id: userId } : null, authenticatedSupabase: () => client, serviceSupabase: () => admin },
    "@/lib/media-security": { validChatMediaKey: () => false },
    "@aws-sdk/client-s3": {}, "@/lib/r2": {},
  });
  return { state, post: (overrides = {}) => route.POST({ headers: { get: () => "Bearer token" }, json: async () => ({ sender, owner_id: "owner-id", dog_id: "dog-id", body: "private conversation", ...overrides }) }), flush: async () => { for (const task of state.tasks) await task(); } };
}

async function testChat() {
  for (const sender of ["owner", "coach"]) {
    const h = chatHarness({ sender });
    assert.equal((await h.post()).status, 200);
    assert.equal(h.state.pushes.length, 0, "Delivery must run after the message response");
    await h.flush();
    assert.equal(h.state.pushes.length, 1);
    const [receiver, title, body, url] = h.state.pushes[0];
    assert.equal(receiver, sender === "owner" ? "coach-id" : "owner-id");
    assert.equal(title, "WanTone｜BarKnow");
    assert.equal(url, `/chat/dog-id?recipient=${sender === "owner" ? "coach" : "owner"}`);
    assert.ok(!body.includes("private conversation"));
    if (sender === "owner") assert.deepEqual(h.state.lookups.find((item) => item.table === "wt_coach_assignments").filters, [["owner_id", "owner-id"], ["dog_id", "dog-id"]]);
  }
  for (const options of [{ authenticated: false }, { saveError: true }]) {
    const h = chatHarness(options);
    assert.notEqual((await h.post()).status, 200);
    assert.equal(h.state.tasks.length, 0);
  }
  const forged = chatHarness();
  assert.equal((await forged.post({ owner_id: "other-owner" })).status, 403);
  assert.equal(forged.state.inserts.length, 0);
  for (const options of [{ pushError: true }, { lookupError: true }, { coachId: null }, { coachId: "owner-id" }]) {
    const h = chatHarness(options);
    assert.equal((await h.post()).status, 200);
    await h.flush();
    if (options.coachId !== undefined) assert.equal(h.state.pushes.length, 0);
  }
}

async function testSubscriptionSave() {
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/example", keys: { p256dh: "public", auth: "auth" } };
  let saved;
  const route = compile("app/api/push-subscriptions/route.ts", {
    "next/server": { NextResponse: { json } },
    "@/lib/push-security": { validPushSubscription: () => true },
    "@/lib/server/supabase": { authenticatedUser: async () => ({ id: "owner-id" }), serviceSupabase: () => ({ from: () => ({ upsert: async (row, options) => {
      assert.deepEqual(Object.keys(row).sort(), ["subscription", "user_id"]);
      assert.equal(options.onConflict, "user_id,endpoint");
      saved = row;
      return { error: null };
    } }) }) },
  });
  assert.equal((await route.POST({ json: async () => ({ subscription }) })).status, 200);
  assert.equal(saved.user_id, "owner-id");
  assert.deepEqual(saved.subscription, subscription);
}

async function testServiceWorker() {
  const handlers = {};
  const notifications = [];
  const navigations = [];
  let badgeOperations = 0;
  const self = { location: { origin: "https://barknow-app.vercel.app" }, navigator: {},
    registration: { showNotification: async (...args) => notifications.push(args) },
    addEventListener: (type, handler) => { handlers[type] = handler; },
    clients: { matchAll: async () => [], openWindow: async (url) => navigations.push(url) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/sw.js"), "utf8"), { self, indexedDB: { open: () => { badgeOperations++; throw new Error("storage unavailable"); } }, console: { warn() {} }, URL });
  let pending;
  handlers.push({ data: { json: () => ({ title: "WanTone", body: "New message", url: "/chat/dog-id" }) }, waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.equal(notifications.length, 1, "Badge persistence failures must not prevent notifications");
  assert.equal(notifications[0][1].data.url, "/chat/dog-id");
  const beforeCareBadge = badgeOperations;
  handlers.push({ data: { json: () => ({ title: "毎日やること", kind: "care", tag: "care-goal-day", url: "/?view=goals" }) }, waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.equal(notifications.length, 2);
  assert.equal(badgeOperations, beforeCareBadge, "Care reminders must not inflate the unread chat badge");
  assert.equal(notifications[1][1].tag, "care-goal-day");
  handlers.notificationclick({ notification: { close() {}, data: { url: "/chat/dog-id" } }, waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.deepEqual(navigations, ["https://barknow-app.vercel.app/chat/dog-id"]);
  let destination;
  const redirect = compile("app/chat/[roomId]/page.tsx", { "next/navigation": { redirect: (url) => { destination = url; } } });
  for (const recipient of ["owner", "coach", "invalid"]) {
    await redirect.default({ params: Promise.resolve({ roomId: "dog-id" }), searchParams: Promise.resolve({ recipient }) });
    assert.equal(destination, `/?view=coach&chatDog=dog-id${recipient === "invalid" ? "" : `&recipient=${recipient}`}`);
  }
}

(async () => {
  await testChat();
  await testSubscriptionSave();
  await testServiceWorker();
  console.log("Chat push: both recipients, assignment scope, auth/save failures, self-send suppression, post-response isolation, schema-compatible subscription saves and notification/click resilience passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
