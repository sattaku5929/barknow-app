const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const main = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");
const client = fs.readFileSync(path.join(__dirname, "../app/supabase.ts"), "utf8");

test("browser credentials use standard autofill metadata", () => {
  assert.ok(main.includes('className="auth-form" onSubmit={submitAuth} autoComplete="on"'));
  assert.ok(main.includes('name="username" type="email"'));
  assert.ok(main.includes('autoComplete="username"'));
  assert.ok(main.includes('name="password" type="password"'));
  assert.ok(main.includes('"current-password" : "new-password"'));
  assert.ok(main.includes('name="new-password-confirmation" type="password" autoComplete="new-password"'));
});
test("existing login passwords are not blocked by the signup-only minimum length", () => {
  assert.ok(main.includes('minLength={authMode === "login" && !anonymousUser ? undefined : 8}'));
  assert.ok(main.includes('authPassword !== authPasswordConfirm'));
});
test("auth sessions persist without saving a plaintext password", () => {
  assert.ok(client.includes('persistSession: true'));
  assert.ok(client.includes('autoRefreshToken: true'));
  assert.ok(!main.includes('localStorage.setItem("password"'));
  assert.ok(!main.includes('localStorage.setItem("authPassword"'));
});
