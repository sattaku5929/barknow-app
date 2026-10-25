const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("app/page.tsx", "utf8");
const trends = fs.readFileSync("components/insights/RecentObservationTrends.tsx", "utf8");
const styles = fs.readFileSync("components/insights/RecentObservationTrends.module.css", "utf8");
const home = page.slice(page.indexOf("const focusedHomeView = ("), page.indexOf("const selectedCategory = "));
const report = page.slice(page.indexOf("const reportView = ("), page.indexOf("const focusedHomeView = ("));
const nav = page.slice(page.indexOf('<nav ref={bottomNavigation.navRef}'), page.indexOf("</nav>",page.indexOf('<nav ref={bottomNavigation.navRef}')));

test("Home includes weekly changes, while bottom navigation has no Changes tab", () => {
  assert.match(home, /id="home-insights"/);
  assert.match(home, /\{reportView\}/);
  assert.equal((nav.match(/data-nav="/g) || []).length, 4);
  assert.doesNotMatch(nav, /data-nav="report"/);
});

test("Home displays weekly summary immediately and folds away extensive analytics", () => {
  assert.match(report, /<RecentObservationTrends[^>]+compact \/>/);
  assert.match(trends, /<InsightDashboardSummary/);
  assert.match(trends, /compact \? <details className=\{styles\.homeDisclosure\}>/);
  assert.match(trends, /<DailyCheckHistoryChart/);
  assert.match(trends, /<ThemeTrendTable/);
  assert.match(trends, /<InsightRecordList/);
  assert.match(styles, /\.homeDisclosure > summary:focus-visible/);
});

test("historical behavior breakdown and interpretive caveat remain discoverable", () => {
  assert.match(report, /className="report-deep-dive"/);
  assert.match(report, /困りごとの変化/);
  assert.match(report, /起きやすい時間帯/);
  assert.match(report, /className="report-note"/);
  assert.doesNotMatch(report, /report-coaching-cta/);
});
