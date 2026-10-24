const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
const ui = fs.readFileSync(path.join(root, "components/OperationAnnouncements.tsx"), "utf8");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/20261024110000_admin_announcements.sql"), "utf8");

test("admin-only editor integrated into admin workspace", () => {
  assert.ok(main.includes('adminTab === "announcements"'));
  assert.ok(main.includes('userRole === "admin" && adminTab === "announcements"'));
  assert.ok(ui.includes('management && role === "admin"'));
  assert.ok(ui.includes("if (!canManage || saving) return;"));
});
test("bell appears in owner and coach headers with per-user unread receipts", () => {
  assert.ok(main.includes('role="coach" userId={currentUserId}'));
  assert.ok(main.includes('role={userRole} userId={currentUserId}'));
  assert.ok(ui.includes('supabase.from("wt_announcement_reads").insert('));
  assert.ok(ui.includes('user_id: userId'));
});
test("database enforces publication, recipient role and admin-only writes", () => {
  for (const statement of [
    "ALTER TABLE public.wt_announcements ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE public.wt_announcement_reads ENABLE ROW LEVEL SECURITY",
    "is_published = true",
    "starts_at <= now()",
    "ends_at > now()",
    "audience = role.role",
    "created_by = (SELECT auth.uid())",
    "user_id = (SELECT auth.uid())",
    "PRIMARY KEY (announcement_id, user_id)",
  ]) assert.ok(sql.includes(statement), statement);
});
