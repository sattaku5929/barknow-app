const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const home = read("app/page.tsx");
const forgot = read("app/auth/forgot-password/page.tsx");
const reset = read("app/auth/reset-password/page.tsx");

test("forgot-password action navigates instead of sending mail", () => {
  assert.ok(home.includes('router.push("/auth/forgot-password")'));
  assert.ok(!home.includes("async function resetPassword()"));
});
test("recovery flow has a separate form and returns to reset route", () => {
  assert.ok(forgot.includes("function ForgotPasswordPage()"));
  assert.ok(forgot.includes("resetPasswordForEmail(email.trim()"));
  assert.ok(forgot.includes('/auth/reset-password'));
  assert.ok(forgot.includes('onSubmit={(event) => void submit(event)}'));
  assert.ok(reset.includes("PASSWORD_RECOVERY"));
  assert.ok(reset.includes("supabase.auth.updateUser({ password })"));
});
