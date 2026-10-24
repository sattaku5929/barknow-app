const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const main = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");
const reset = fs.readFileSync(path.join(__dirname, "../app/auth/reset-password/page.tsx"), "utf8");

test("reset email links to a dedicated password-change page", () => {
  assert.match(main, /resetPasswordForEmail\(authEmail\.trim\(\), \{ redirectTo: `\$\{window\.location\.origin\}\/auth\/reset-password` \}/);
});
test("recovery page requires recovery session and authenticated update", () => {
  assert.match(reset, /PASSWORD_RECOVERY/);
  assert.match(reset, /supabase\.auth\.getUser\(\)/);
  assert.match(reset, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(reset, /password\.length < 8/);
  assert.match(reset, /password !== confirm/);
});
test("login lets user reveal password without weakening signup policy", () => {
  assert.match(main, /type=\{showAuthPassword \? "text" : "password"\}/);
  assert.match(main, /minLength=\{authMode === "login" && !anonymousUser \? undefined : 8\}/);
});
