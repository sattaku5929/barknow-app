const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("app/page.tsx","utf8");
const styles = fs.readFileSync("app/globals.css","utf8");
const care = fs.readFileSync("components/owner/HomeCareGroups.tsx","utf8");
const home = page.slice(page.indexOf('const focusedHomeView = ('),page.indexOf('const selectedCategory = '));
const record = page.slice(page.indexOf('const recordView = '),page.indexOf('const goalsView = ('));
const report = page.slice(page.indexOf('const reportView = ('),page.indexOf('const coachingFeaturesLocked ='));

test("active Owner home, not legacy home, remains the rendered home",()=>{
  assert.match(page,/\{view === "home" && focusedHomeView\}/);
  assert.match(home,/className="home-v3"/);
});
test("today's care summary scrolls to the current in-page care group",()=>{
  assert.match(home,/aria-label="今日のお世話へ移動"/);
  assert.match(home,/document\.getElementById\("home-care-day"\)\?\.scrollIntoView/);
  assert.match(care,/id=\{\x60home-care-\$\{period\.key\}\x60\}/);
  assert.doesNotMatch(home,/onClick=\{\(\) => navigateOwnerView\("goals"\)\}/);
});
test("record menu clearly offers both Daily Check and Event Log",()=>{
  assert.match(record,/title="今日を記録"/);
  assert.match(record,/className="owner-record-daily-action"/);
  assert.match(record,/onClick=\{\(\) => openNewRecord\("daily"\)\}/);
  assert.match(record,/今日の状態を記録/);
  assert.match(record,/できごとを記録/);
  assert.ok(record.indexOf('className="owner-record-daily-action"') < record.indexOf('<ObservationEventHub'));
  assert.ok(record.indexOf('<ObservationEventHub') < record.indexOf('<OwnerRecordScene'));
  assert.match(record,/disabled=\{connection !== "online" \|\| !profile\.id \|\| todayCheckStatus === "loading"\}/);
});
test("changes screen prioritizes observation trends over illustration",()=>{
  assert.ok(report.indexOf("<RecentObservationTrends") > -1);
  assert.ok(report.indexOf("<RecentObservationTrends") < report.indexOf("<OwnerReportScene"));
  assert.match(report,/className="report-deep-dive"/);
});
test("compact home summary retains legibility and keyboard focus",()=>{
  assert.match(styles,/\.home-v3-summary > button \{[\s\S]*?min-height:88px/);
  assert.match(styles,/\.home-v3-summary small \{[^}]*font-size:11px/);
  assert.match(styles,/\.home-v3 button:focus-visible/);
  assert.match(styles,/#home-care-day \{ scroll-margin-top:24px; \}/);
});
