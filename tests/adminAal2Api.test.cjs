/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function compile(file, mocks) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "Buffer", code)(name => {
    if (!(name in mocks)) throw new Error("Unexpected import " + name);
    return mocks[name];
  }, loaded, loaded.exports, Buffer);
  return loaded.exports;
}
const uid = "00000000-0000-4000-8000-000000000001";
const token = (aal, sub=uid) => "header." + Buffer.from(JSON.stringify({ aal, sub })).toString("base64url") + ".signature";
const request = t => ({ headers: { get: name => name === "authorization" ? "Bearer " + t : null } });
function harness(role, userId=uid) {
  return compile("lib/server/supabase.ts", {
    "@supabase/supabase-js": {
      createClient: (_url, key) => key === "service-key"
        ? { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role } }) }) }) }) }
        : { auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) } },
    },
    "next/server": {},
  });
}
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
(async () => {
  const admin = harness("admin");
  assert.equal(await admin.authenticatedStaffRole(request(token("aal1"))), null, "AAL1 admin must be denied");
  assert.equal((await admin.authenticatedStaffRole(request(token("aal2"))))?.role, "admin", "AAL2 admin allowed");
  assert.equal(await admin.authenticatedStaffRole(request(token("aal2", "another-user"))), null, "JWT subject mismatch denied");
  assert.equal(await admin.authenticatedStaffRole(request("malformed")), null, "malformed token denied");
  const coach = harness("coach");
  assert.equal((await coach.authenticatedStaffRole(request(token("aal1"))))?.role, "coach", "coach AAL1 preserved");
  const owner = harness("owner");
  assert.equal(await owner.authenticatedStaffRole(request(token("aal2"))), null, "owner cannot use staff endpoints");
  for (const file of ["app/api/google-calendar/connect/route.ts","app/api/google-calendar/status/route.ts","app/api/google-calendar/sync/route.ts"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.match(source, /authenticatedStaffRole\(request\)/, file + " must check bearer AAL2");
    assert.doesNotMatch(source, /requireStaffRole\(/, file + " must not use role-only guard");
  }
  const upload = fs.readFileSync(path.join(__dirname, "..", "app/api/upload-url/route.ts"), "utf8");
  assert.match(upload, /authenticatedStaffRole\(request\)/, "admin media upload must check bearer AAL2");
  console.log("Admin AAL2 API guard unit checks passed (mocked tokens; live token tests still required)");
})().catch(error => { console.error(error); process.exitCode = 1; });
