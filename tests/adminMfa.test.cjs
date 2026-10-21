const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261021150000_admin_mfa_aal2.sql"), "utf8");
const gate = fs.readFileSync(path.join(__dirname, "../components/admin/AdminMfaGate.tsx"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");

test("admin authorization requires Supabase verified AAL2", () => {
  assert.match(migration, /create or replace function public\.wt_is_admin\(\)/i);
  assert.match(migration, /auth\.jwt\(\) ->> 'aal' = 'aal2'/);
  assert.match(migration, /role = 'admin'/);
});
test("staff predicate cannot grant AAL1 admins coach privileges", () => {
  assert.match(migration, /role = 'coach' or \(role = 'admin' and auth\.jwt\(\) ->> 'aal' = 'aal2'\)/);
});
test("TOTP uses Supabase enrollment, challenge and verification", () => {
  for (const api of ["mfa.enroll", "mfa.challenge", "mfa.verify", "mfa.getAuthenticatorAssuranceLevel"]) assert.ok(gate.includes(api), api);
  assert.match(gate, /currentLevel === "aal2"/);
  assert.match(page, /<AdminMfaGate>\{adminView\}<\/AdminMfaGate>/);
});
