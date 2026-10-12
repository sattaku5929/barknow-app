/* eslint-disable @typescript-eslint/no-require-imports -- Executes the actual page handlers. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const source = ts.createSourceFile("page.tsx", fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = {};
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ["acceptCoachingOffer", "declineCoachingOffer"].includes(node.name?.text)) handlers[node.name.text] = node;
  ts.forEachChild(node, visit);
}
visit(source);

async function run(name, confirmed, saving = false, rpcError = null) {
  const calls = [], notices = [], prompts = [], busy = [];
  let refreshes = 0, sessions = 0;
  const context = {
    saving, window: { confirm(message) { prompts.push(message); return confirmed; } },
    setSaving: value => busy.push(value), showNotice: message => notices.push(message),
    loadAdminWorkspace: async () => { refreshes++; },
    supabase: { rpc: async (...args) => { calls.push(args); return { error: rpcError }; }, auth: { getSession: async () => { sessions++; return { data: { session: null } }; } } },
  };
  const code = ts.transpileModule(handlers[name].getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const handler = new Function(...Object.keys(context), `${code}; return ${name};`)(...Object.values(context));
  await handler({ id: "offer-1", dogName: "むぎ" });
  return { calls, notices, prompts, busy, refreshes, sessions };
}

(async () => {
  for (const [name, rpcName] of [["acceptCoachingOffer", "wt_coach_accept_application"], ["declineCoachingOffer", "wt_coach_decline_application"]]) {
    const canceled = await run(name, false);
    assert.equal(canceled.prompts.length, 1);
    assert.match(canceled.prompts[0], /むぎ/);
    assert.deepEqual(canceled.calls, []);
    assert.deepEqual(canceled.busy, []);
    assert.equal(canceled.refreshes, 0);
    assert.equal(canceled.sessions, 0);
    const accepted = await run(name, true);
    assert.deepEqual(accepted.calls, [[rpcName, { target_application_id: "offer-1" }]]);
    assert.equal(accepted.refreshes, 1);
    assert.deepEqual(accepted.busy, [true, false]);
    const pending = await run(name, true, true);
    assert.deepEqual(pending.calls, []);
    assert.deepEqual(pending.prompts, []);
    const failed = await run(name, true, false, { message: "assignment changed" });
    assert.equal(failed.refreshes, 0);
    assert.equal(failed.sessions, 0);
    assert.match(failed.notices[0], /assignment changed/);
    assert.deepEqual(failed.busy, [true, false]);
  }
  console.log("Coach offer confirmation: cancel, confirm, busy and RPC failure passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
