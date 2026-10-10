const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");
const rows = Array.from({ length: 501 }, (_, i) => ({
  id: String(i), local_date: "2026-10-10", occurred_at: "2026-10-10T01:00:00Z", theme_key: "walk", note: null,
  wt_observation_events: i % 2 ? [{ event_result: "success", handled_by_member_id: null }] : { event_result: "neutral", handled_by_member_id: "member" },
}));
let data = rows, serverCap = 500, failOffset = -1;
const calls = [];
const client = createClient("https://test.invalid", "publishable-test-key", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, options });
    const offset = Number(parsed.searchParams.get("offset") || 0);
    if (offset === failOffset) return new Response(JSON.stringify({ message: "unavailable" }), { status: 500, headers: { "Content-Type": "application/json" } });
    const result = data.slice(offset, offset + Math.min(serverCap, Number(parsed.searchParams.get("limit"))));
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json", "Content-Range": `${offset}-${offset + result.length - 1}/${data.length}` } });
  } },
});
const moduleObject = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/insights/recordSources.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function("require", "module", "exports", code)(name => name === "@/app/supabase" ? { supabase: client } : require(name), moduleObject, moduleObject.exports);
const { loadInsightEvents } = moduleObject.exports;
const trends = { current_start: "2026-10-04", as_of_local_date: "2026-10-10", previous_start: "2026-09-27", previous_end: "2026-10-03" };
(async () => {
  const result = await loadInsightEvents("dog-a", trends, { period: "current" });
  assert.equal(result.length, 501);
  assert.equal(calls.length, 2);
  assert.equal(result[0].note, "");
  assert.equal(result[0].result, "neutral");
  assert.equal(result[1].result, "success");
  for (const call of calls) {
    const query = call.url.searchParams;
    assert.equal(call.options.method, "GET");
    assert.equal(query.get("dog_id"), "eq.dog-a");
    assert.equal(query.get("entry_kind"), "eq.event");
    assert.equal(query.get("deleted_at"), "is.null");
    assert.equal(query.get("local_date"), "gte.2026-10-04");
    assert.deepEqual(query.getAll("local_date"), ["gte.2026-10-04", "lte.2026-10-10"]);
    assert.equal(query.get("order"), "occurred_at.desc,id.desc");
    assert.equal(query.get("theme_key"), null, "all themes included");
  }
  assert.equal(calls[1].url.searchParams.get("offset"), "500");
  calls.length = 0;
  serverCap = 100;
  assert.equal((await loadInsightEvents("dog-b", trends, { period: "previous", themeKey: "walk", handlerIds: ["member"] })).length, 501);
  assert.equal(calls.length, 6, "continues when server cap is below page size");
  for (const call of calls) {
    assert.equal(call.url.searchParams.get("dog_id"), "eq.dog-b");
    assert.deepEqual(call.url.searchParams.getAll("local_date"), ["gte.2026-09-27", "lte.2026-10-03"]);
    assert.equal(call.url.searchParams.get("theme_key"), "eq.walk");
    assert.equal(call.url.searchParams.get("wt_observation_events.handled_by_member_id"), "in.(member)");
  }
  serverCap = 500;
  failOffset = 500;
  await assert.rejects(loadInsightEvents("dog-a", trends, { period: "current" }));
  failOffset = -1;
  data = [];
  assert.deepEqual(await loadInsightEvents("dog-a", trends, { period: "current" }), []);
  console.log("Insight records: all 501 rows, actual Supabase pagination, lower server cap, dog/date/theme/member filters, read-only requests and partial-error rejection passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
