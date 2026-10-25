const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("app/page.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const bottom = fs.readFileSync("app/bottom-nav.css", "utf8");
const home = page.slice(page.indexOf("const focusedHomeView = ("),page.indexOf("const selectedCategory = "));
const report = page.slice(page.indexOf("const reportView = ("),page.indexOf("const focusedHomeView = ("));
const record = page.slice(page.indexOf("const recordView = "),page.indexOf("const goalsView = ("));
const nav = page.slice(page.indexOf('<nav ref={bottomNavigation.navRef}'),page.indexOf("</nav>",page.indexOf('<nav ref={bottomNavigation.navRef}')));

test("exactly four bottom destinations: Home, Record, Chat, My Page",()=>{
  assert.equal((nav.match(/<button\b/g)||[]).length,4);
  assert.deepEqual([...nav.matchAll(/data-nav="([^"]+)"/g)].map(m=>m[1]),["home","record","coach","profile"]);
  assert.match(bottom,/grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(nav,/data-nav="report"/);
  assert.doesNotMatch(nav,/aria-haspopup="dialog"/);
  assert.match(nav,/aria-current=\{view === "record" \? "page" : undefined\}/);
});

test("Home includes trends and calendar but has no data entry",()=>{
  assert.match(home,/className="home-v3"/);
  assert.match(home,/<section id="home-insights"/);
  assert.match(home,/\{reportView\}/);
  assert.match(home,/<HomeCalendar/);
  assert.doesNotMatch(home,/<DailyCheckForm|<ObservationEventForm|<ObservationEventHub|<HomeCareGroups|className="home-v3-daily"/);
  assert.ok(home.indexOf('id="home-insights"')<home.indexOf("<HomeCalendar"));
  assert.match(report,/<RecentObservationTrends/);
  assert.match(report,/className="report-deep-dive"/);
});
test("Home summary routes entries to Record, trend summary stays on Home",()=>{
  assert.match(home,/goToRecordSection\("events"\)/);
  assert.match(home,/goToRecordSection\("care"\)/);
  assert.match(home,/document\.getElementById\("home-insights"\)\?\.scrollIntoView/);
  assert.doesNotMatch(home,/document\.getElementById\("home-event-log"\)/);
});
test("Record contains Daily Check, Event Hub and Care inputs",()=>{
  assert.match(record,/title="今日を記録"/);
  assert.match(record,/className="owner-record-daily-action"/);
  assert.match(record,/<DailyCheckForm/);
  assert.match(record,/<ObservationEventForm/);
  assert.match(record,/<ObservationEventHub/);
  assert.match(record,/<HomeCareGroups/);
  assert.match(record,/id="record-events"/);
  assert.match(record,/id="record-care"/);
  assert.match(record,/onIconChange=\{changeHomeCareIcon\}/);
});
test("record save/cancel returns to Record hub rather than bouncing to Home",()=>{
  assert.match(record,/setRecordCategory\(null\)/);
  assert.match(record,/setEventTheme\(null\)/);
  assert.doesNotMatch(record,/onSaved=\{[^}]*returnToOwnerHome\(\)/);
  assert.match(page,/if \(nextView === "report"\)/);
  assert.match(page,/navigateOwnerView\("record"\)/);
});
test("no abandoned quick-record sheet and mobile controls retain readable focus",()=>{
  assert.doesNotMatch(page,/RecordQuickActions|recordQuickOpen|quickEventScrollPendingRef/);
  assert.match(styles,/\.home-v3-summary > button \{[^}]*min-height:88px/);
  assert.match(styles,/\.home-v3 button:focus-visible/);
  assert.match(styles,/\.owner-view-record \.owner-record-daily-action:focus-visible/);
  assert.match(bottom,/:focus-visible/);
});
