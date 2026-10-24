const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const main = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");
const reset = fs.readFileSync(path.join(__dirname, "../app/auth/reset-password/page.tsx"), "utf8");
const forgot = fs.readFileSync(path.join(__dirname, "../app/auth/forgot-password/page.tsx"), "utf8");

test("forgot link navigates to separate email form", () => {
  assert.match(main, /router\.push\("\/auth\/forgot-password"\)/);
  assert.match(forgot, /type="email"/);
  assert.match(forgot, /resetPasswordForEmail\(email\.trim\(\)/);
  assert.match(forgot, /\/auth\/reset-password/);
  assert.match(forgot, /再設定メールを送信する/);
});
test("recovery page requires recovery session and authenticated update", () => {
  assert.match(reset, /PASSWORD_RECOVERY/);
  assert.match(reset, /supabase\.auth\.getUser\(\)/);
  assert.match(reset, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(reset, /password\.length < 8/);
  assert.match(reset, /password !== confirm/);
});
test("password fields use accessible inline eye toggles", () => {
  const eye = fs.readFileSync(path.join(__dirname, "../components/auth/PasswordVisibilityButton.tsx"), "utf8");
  assert.match(main, /type=\{showAuthPassword \? "text" : "password"\}/);
  assert.match(main, /<PasswordVisibilityButton visible=\{showAuthPassword\}/);
  assert.match(reset, /<PasswordVisibilityButton visible=\{showPassword\}/);
  assert.match(reset, /<PasswordVisibilityButton visible=\{showConfirmPassword\}/);
  assert.match(reset, /showConfirmPassword \? "text" : "password"/);
  assert.doesNotMatch(main, /パスワードを表示する<\/label>/);
  assert.doesNotMatch(reset, /パスワードを表示する<\/label>/);
  assert.match(eye, /aria-label=/);
  assert.match(eye, /aria-pressed=/);
  assert.match(eye, /type="button"/);
  assert.match(main, /minLength=\{authMode === "login" && !anonymousUser \? undefined : 8\}/);
});
