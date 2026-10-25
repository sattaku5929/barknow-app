const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const page = readFileSync(join(__dirname,"../app/page.tsx"),"utf8");
const migration = readFileSync(join(__dirname,"../supabase/migrations/20261025110000_admin_coach_assignment_repair.sql"),"utf8");
test("admin screen only exposes repair for unresolved server-side issue candidates", () => {
  assert.match(page,/userRole === "admin" && adminAssignmentIssues\[application\.id\]/);
  assert.match(page,/supabase\.rpc\("wt_admin_coaching_assignment_issues"\)/);
  assert.match(page,/supabase\.rpc\("wt_admin_reconcile_confirmed_assignment"/);
  assert.match(page,/repairConfirmed\[application\.id\]/);
  assert.match(page,/trim\(\)\.length < 15/);
});
test("repair is an explicit audited operation; neither status nor role is rewritten", () => {
  assert.match(migration,/if not public\.wt_is_admin\(\)/);
  assert.match(migration,/if a\.owner_id = a\.assigned_coach_id/);
  assert.match(migration,/if exists\(select 1 from public\.wt_coach_assignments/);
  assert.match(migration,/insert into public\.wt_assignment_repair_audit/);
  assert.doesNotMatch(migration,/update public\.wt_user_roles|delete from public\.wt_online_sessions|delete from public\.wt_coach_messages/i);
});
