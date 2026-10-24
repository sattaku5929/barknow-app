const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const main = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");

test("confirmation appears for signup and anonymous conversion", () => {
  assert.ok(main.includes('const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");'));
  assert.match(main, /\(anonymousUser \|\| authMode === "signup"\) && <label[^>]*>パスワード（確認）/);
  assert.ok(main.includes('autoComplete="new-password" minLength={8} value={authPasswordConfirm}'));
});
test("mismatch prevents submit before saving or auth API calls", () => {
  const submit = main.split("async function submitAuth(")[1].split("async function resetPassword(")[0];
  assert.ok(submit.indexOf('authPassword !== authPasswordConfirm') >= 0);
  assert.ok(submit.indexOf('authPassword !== authPasswordConfirm') < submit.indexOf("setSaving(true)"));
  assert.ok(submit.includes('setAuthError("確認用パスワードが一致しません。")'));
  assert.ok(submit.includes("return;"));
});
test("login path does not require password confirmation", () => {
  assert.ok(main.includes('if ((anonymousUser || authMode === "signup") && authPassword !== authPasswordConfirm)'));
});
