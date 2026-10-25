const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("app/page.tsx", "utf8");
const navCss = fs.readFileSync("app/bottom-nav.css", "utf8");
const trends = fs.readFileSync("components/insights/RecentObservationTrends.tsx", "utf8");
const navStart = page.indexOf('<nav ref={bottomNavigation.navRef}');
const navEnd = page.indexOf('</nav>', navStart);
const nav = page.slice(navStart, navEnd);
const homeStart = page.indexOf('const focusedHomeView = (');
const homeEnd = page.indexOf('const selectedCategory = ', homeStart);
const home = page.slice(homeStart, homeEnd);
const report = page.slice(page.indexOf("const reportView = ("), homeStart);

test("Owner bottom navigation has four controls, without Changes", () => {
  assert.ok(navStart > 0 && navEnd > navStart);
  assert.equal((nav.match(/data-nav="/g) || []).length, 4);
  for (const id of ["home", "record", "coach", "profile"]) {
    assert.match(nav, new RegExp('data-nav="' + id + '"'));
  }
  assert.doesNotMatch(nav, /data-nav="report"/);
  assert.ok(nav.includes("bottom-nav-four"));
  assert.match(navCss, /bottom-nav\.bottom-nav-four[\s\S]*grid-template-columns: repeat\(5/);
  assert.match(navCss, /> button\[data-nav="record"\] \{ grid-column: 3;/);
});

test("weekly changes and the existing detailed trend analysis remain in Home", () => {
  assert.match(home, /id="home-changes"/);
  assert.match(home, /<RecentObservationTrends[\s\S]*?compact \/>/);
  assert.match(home, /\{reportView\}/);
  assert.match(report, /className="report-deep-dive"/);
  assert.match(report, /困りごとの変化/);
  assert.match(report, /起きやすい時間帯/);
  assert.match(home, /document\.getElementById\("home-changes"\)\?\.scrollIntoView/);
});

test("compact trends keep weekly overview visible and reveal charts on demand", () => {
  assert.match(trends, /<InsightDashboardSummary/);
  assert.match(trends, /compact \? <details className=\{styles\.homeDisclosure\}>/);
  assert.match(trends, /<DailyCheckHistoryChart/);
  assert.match(trends, /<ThemeTrendTable/);
  assert.match(trends, /<InsightRecordList/);
});

test("no changes to Daily Check, Event Log or care actions", () => {
  assert.match(home, /<ObservationEventHub/);
  assert.match(home, /<ObservationEventForm/);
  assert.match(home, /openNewRecord\("daily"\)/);
  assert.match(home, /<HomeCareGroups/);
  assert.match(home, /<HomeCalendar/);
  assert.match(nav, /data-nav="record"[\s\S]*setRecordQuickOpen\(true\)/);
});