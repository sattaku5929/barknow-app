const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const legalSource = fs.readFileSync(path.join(root, "lib/legalDocuments.ts"), "utf8");
const match = legalSource.match(/export const legalDocuments = (\{[\s\S]*\}) as const;/);
assert.ok(match, "legal document export must stay parseable");
const docs = JSON.parse(match[1]);

test("all three legal documents are present with distinct responsibilities", () => {
  assert.deepEqual(Object.keys(docs).sort(), ["disclaimer", "privacy", "terms"]);
  assert.ok(docs.disclaimer.sections.length >= 9);
  assert.ok(docs.terms.sections.length >= 26);
  assert.ok(docs.privacy.sections.length >= 20);
  for (const [key, doc] of Object.entries(docs)) {
    assert.ok(doc.title && doc.eyebrow, key + ": title and eyebrow required");
    const headings = doc.sections.map(section => section.heading);
    assert.equal(new Set(headings).size, headings.length, key + ": duplicate headings");
    for (const section of doc.sections) {
      assert.ok(section.body.trim().length >= 60, key + ": section is incomplete");
    }
  }
});

test("critical service-specific obligations are visibly addressed", () => {
  const all = Object.fromEntries(Object.entries(docs).map(([key, doc]) => [key, doc.sections.map(s => s.body).join("\n")]));
  for (const word of ["獣医", "緊急", "通知", "行動"]) assert.match(all.disclaimer, new RegExp(word));
  for (const word of ["解約", "Stripe", "退会", "損害賠償", "個人情報", "有料"]) assert.match(all.terms, new RegExp(word));
  for (const word of ["利用目的", "第三者", "開示", "安全管理", "削除", "コーチ"]) assert.match(all.privacy, new RegExp(word));
});

test("draft clearly blocks unreviewed public release", () => {
  assert.match(legalSource, /DRAFT: do not release/);
  const checklist = fs.readFileSync(path.join(root, "docs/legal-release-checklist.md"), "utf8");
  assert.match(checklist, /mainへマージしない/);
  assert.match(checklist, /Stripe/);
  assert.match(checklist, /個人情報/);
});

test("legal pages and signup links are accessible without login", () => {
  const publicPage = fs.readFileSync(path.join(root, "app/legal/[document]/page.tsx"), "utf8");
  const home = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
  for (const key of Object.keys(docs)) {
    assert.match(publicPage, new RegExp("legal/" + key));
    assert.match(home, new RegExp("/legal/" + key));
  }
  assert.match(home, /const settingsDocuments = legalDocuments/);
  assert.match(publicPage, /改訂草案/);
});
