const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("app/page.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");
const ownerChat = page.slice(page.indexOf('const coachView = ('), page.indexOf('const profileSummaryView = ('));

test("owner keeps two discoverable, accessible coaching tabs", () => {
  assert.match(ownerChat, /owner-coach-tabs owner-consultation-tabs" role="tablist"/);
  assert.match(ownerChat, /role="tab" aria-selected={ownerCoachTab === "chat"}/);
  assert.match(ownerChat, /role="tab" aria-selected={ownerCoachTab === "sessions"}/);
  assert.match(ownerChat, /navigateCoachTab\("chat"\)/);
  assert.match(ownerChat, /navigateCoachTab\("sessions"\)/);
});
test("owner coaching navigation follows the page, never sticks", () => {
  assert.doesNotMatch(ownerChat, /owner-consultation-tabs is-sticky/);
  assert.doesNotMatch(css, /\.app-stage \.owner-view-coach \.owner-consultation-tabs\.is-sticky/);
  assert.match(css, /\.app-stage \.owner-view-coach \.owner-consultation-tabs \{\s*position: static;/);
  assert.match(css, /\.app-stage \.owner-view-coach \.owner-consultation-tabs > button \{[\s\S]*?min-height: 64px;/);
  assert.doesNotMatch(css, /\.app-stage \.owner-view-coach \.owner-consultation-tabs > button \{[\s\S]{0,180}min-height: 104px/);
});
test("media list is a compact accessible toolbar action, not a large standalone CTA", () => {
  assert.match(ownerChat, /className="owner-chat-toolbar"/);
  assert.match(ownerChat, /className="owner-chat-media-link"/);
  assert.match(ownerChat, /aria-label="写真・動画・記事のメディア一覧を開く"/);
  assert.match(ownerChat, /setMediaGalleryOpen\(true\)/);
  assert.match(ownerChat, /<ChatMediaLibrary messages={chronologicalMessages}/);
  assert.doesNotMatch(ownerChat, />写真・動画・記事を探す<\/button>/);
  assert.match(css, /\.app-stage \.owner-view-coach \.owner-chat-media-link \{/);
});
