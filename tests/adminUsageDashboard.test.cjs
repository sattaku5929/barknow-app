const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("app/page.tsx","utf8");
const component = fs.readFileSync("components/admin/AdminUsageDashboard.tsx","utf8");
const migration = fs.readFileSync("supabase/migrations/20261024131329_admin_usage_dashboard.sql","utf8");
test("analytics is admin-only and uses only the aggregate RPC",()=>{
  assert.match(source,/userRole === "admin" && adminTab === "analytics" && <AdminUsageDashboard/);
  assert.match(component,/\.rpc\("wt_admin_usage_dashboard"\)/);
  assert.doesNotMatch(component,/\.from\("wt_user_roles"\)/);
});
test("metrics document reliable definitions",()=>{
  assert.match(component,/Daily Check利用率/);
  assert.match(component,/訪問履歴があるOwner/);
  assert.match(component,/期間内に1日以上入力/);
  assert.match(migration,/e\.deleted_at is null/);
  assert.match(migration,/public\.wt_is_admin\(\)/);
  assert.match(migration,/revoke all on function public\.wt_admin_usage_dashboard\(\) from public, anon, authenticated/);
});
