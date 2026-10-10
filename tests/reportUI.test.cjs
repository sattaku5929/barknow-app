const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.join(__dirname, "..");
const ownerSource = ts.createSourceFile("page.tsx", fs.readFileSync(path.join(root, "app/page.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let reportView;
function findReportView(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ownerSource) === "reportView") reportView = node.initializer;
  ts.forEachChild(node, findReportView);
}
findReportView(ownerSource);
assert.ok(reportView);
const reportSource = reportView.getText(ownerSource);
assert.doesNotMatch(reportSource, /LIFE CONDITION|WELLBEING ANALYSIS|LOG CALENDAR|report-condition|wellbeing-analysis|report-calendar|状態・カレンダー・困りごとの推移/);
for (const retained of ["RecentObservationTrends", "詳細データを見る", "困りごとの推移", "困りごとの変化", "behavior-chart", "report-filter"]) assert.ok(reportSource.includes(retained), `${retained} stays in owner report`);
function load(relative, reactOverride = React) {
  const filename = path.join(root, relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = name => {
    if (name === "react") return reactOverride;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === "@/lib/insights/observationTrends") return new Proxy({}, {
      get: () => () => { throw new Error("UI rendering must not access the database"); },
    });
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      const file = [base, `${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(path.join(root, candidate)));
      return load(file, reactOverride);
    }
    return require(name);
  };
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  return module.exports;
}

const trends = {
  current_start: "2026-10-04", as_of_local_date: "2026-10-10",
  previous_start: "2026-09-27", previous_end: "2026-10-03",
  event_overall: [{ period: "current", total_count: 4 }],
  event_themes: [], daily_metrics: [], handlers: [], distances: [], numeric_metrics: [], daily_event_days: [],
};
const Summary = load("components/insights/InsightDashboardSummary.tsx").default;
const summaryHtml = renderToStaticMarkup(React.createElement(Summary, { trends, dailyDays: [], onEventRecords: () => {} }));
assert.match(summaryHtml, /今週のサマリー/);
assert.match(summaryHtml, /できごと/);
assert.doesNotMatch(summaryHtml, /今日の状態|最近の気づき|insight-today-card|insight-weekly-hero/);

// Render the actual owner report subtree in loaded, loading, error and offline states.
for (const scenario of [
  { online: true, loading: false, error: false },
  { online: true, loading: true, error: false },
  { online: true, loading: false, error: true },
  { online: false, loading: false, error: false },
]) {
  const states = [trends, [], scenario.error, scenario.loading, null];
  const Report = load("components/insights/RecentObservationTrends.tsx", {
    ...React, useState: () => [states.shift(), () => {}], useEffect: () => {}, useRef: () => ({ current: null }),
  }).default;
  const html = renderToStaticMarkup(React.createElement(Report, { dogId: "dog", selectedThemes: [], online: scenario.online }));
  assert.doesNotMatch(html, /最近の変化|今日の状態|最近の気づき|recent-observation-trends-title|recent-discoveries-title/);
  assert.doesNotMatch(html, /この変化を一緒に振り返る|WITH YOUR COACH|insight-coach-cta|担当コーチが決まると/);
  assert.doesNotMatch(html, /insight-record-entry|RECENT LOGS|<h3>最近の記録<\/h3>/);
  assert.doesNotMatch(html, /詳しいデータを見る|項目別平均・担当者別|insight-deep-dive|担当した人による記録の違い/);
  assert.match(html, /aria-label="記録のサマリーと詳細"/);
  if (scenario.online && !scenario.loading && !scenario.error) {
    for (const title of ["今週のサマリー", "できごとの傾向", "Daily Checkの推移", "直近7日間のできごとはまだありません"]) assert.ok(html.includes(title));
  }
}
console.log("Owner report UI: removed overviews and coach invitation absent in all states; summary, records and details preserved.");

const Table = load("components/insights/ThemeTrendTable.tsx").default;
const makeTrend = (theme_key, counts) => ({
  theme_key, period: "current", total_count: counts.reduce((a, b) => a + b, 0),
  success_count: counts[0], neutral_count: counts[1], concern_count: counts[2],
  success_rate: 33.3, neutral_rate: 33.3, concern_rate: 33.3,
});
const sampleTrends = [makeTrend("barking", [5, 2, 1]), makeTrend("walk", [8, 3, 0]), makeTrend("dog_reaction", [0, 1, 2])];
const sampleHtml = renderToStaticMarkup(React.createElement(Table, { trends: sampleTrends, onRecords: () => {} }));
assert.equal((sampleHtml.match(/scope="row"/g) || []).length, 3);
assert.equal((sampleHtml.match(/role="img"/g) || []).length, 3);
assert.match(sampleHtml, /うまくできた5件、いつも通り2件、気になった1件/);
assert.match(sampleHtml, /width:62.5%/);
assert.match(sampleHtml, /他の犬への反応/);
assert.doesNotMatch(sampleHtml, /<button|記録を見る/);
assert.doesNotMatch(sampleHtml, /insight-theme-card|insight-theme-breakdown|根拠の記録を見る/);
for (const counts of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], [1000, 250, 7]]) {
  const trend = makeTrend("barking", counts);
  const tree = Table({ trends: [trend] });
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /NaN|Infinity/);
  if (trend.total_count) {
    const widths = [...html.matchAll(/width:([\d.]+)%/g)].map(match => Number(match[1]));
    assert.ok(Math.abs(widths.reduce((a, b) => a + b, 0) - 100) < 0.000001, "stacked widths sum to 100 even with rounded rates");
  }
}
// Real report integration: current rows only, selected-theme ordering and unchanged filters.
const reportDailyDays = [{ local_date: trends.previous_start }];
const reportStates = [{ ...trends, event_themes: [...sampleTrends, { ...sampleTrends[0], period: "previous" }] }, reportDailyDays, false, false, null];
let selection;
const Report = load("components/insights/RecentObservationTrends.tsx", {
  ...React, useState: () => [reportStates.shift(), value => { selection = value; }], useEffect: () => {}, useRef: () => ({ current: null }),
}).default;
const reportTree = Report({ dogId: "dog", online: true, selectedThemes: ["walk"] });
function findTable(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.map(findTable).find(Boolean);
  if (node.type?.name === "ThemeTrendTable") return node;
  return findTable(node.props?.children);
}
const embedded = findTable(reportTree);
assert.ok(embedded);
assert.equal(embedded.props.trends.length, 3);
assert.equal(embedded.props.trends[0].theme_key, "walk");
function findNodes(node, predicate, parents = []) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(child => findNodes(child, predicate, parents));
  return [...(predicate(node) ? [{ node, parents }] : []), ...findNodes(node.props?.children, predicate, [...parents, node])];
}
const visibleTables = findNodes(reportTree, node => node.type?.name === "ThemeTrendTable");
assert.equal(visibleTables.length, 1, "one owner event table only");
assert.ok(visibleTables[0].parents.every(parent => parent.type !== "details"), "table must be visible without opening any disclosure");
const visibleCharts = findNodes(reportTree, node => node.type?.name === "DailyCheckHistoryChart");
assert.equal(visibleCharts.length, 1);
assert.equal(visibleCharts[0].node.props.days, reportDailyDays, "previous-week data reaches the chart without a current-week filter");
assert.ok(visibleCharts[0].parents.every(parent => parent.type !== "details"), "Daily Check chart is in the initial summary, outside disclosures");
const moreButtons = findNodes(reportTree, node => node.type === "button" && node.props["aria-label"] === "詳しく見る、直近7日間の全テーマの記録");
assert.equal(moreButtons.length, 1);
moreButtons[0].node.props.onClick();
assert.deepEqual(selection, { title: "最近のできごと", filter: { period: "current" }, daily: false }, "one details button opens all themes, not a single-theme filter");
const summaryNode = findNodes(reportTree, node => node.type?.name === "InsightDashboardSummary")[0].node;
const summaryTree = Summary(summaryNode.props);
const eventButton = findNodes(summaryTree, node => node.type === "button")[0].node;
assert.equal(eventButton.props.type, "button");
assert.match(eventButton.props["aria-label"], /できごと4件、最近の記録を見る/);
eventButton.props.onClick();
assert.deepEqual(selection, { title: "最近のできごと", filter: { period: "current" }, daily: false }, "summary tap opens all current event records");
const selectedStates = [{ ...trends, event_themes: sampleTrends }, [], false, false, selection];
const SelectedReport = load("components/insights/RecentObservationTrends.tsx", {
  ...React, useState: () => [selectedStates.shift(), value => { selection = value; }], useEffect: () => {}, useRef: () => ({ current: null }),
}).default;
const selectedTree = SelectedReport({ dogId: "dog", online: true, selectedThemes: [] });
const list = findNodes(selectedTree, node => node.type?.name === "InsightRecordList")[0].node;
assert.equal(list.props.dogId, "dog");
assert.deepEqual(list.props.filter, { period: "current" });
assert.equal(list.props.daily, false);
assert.equal(list.props.trends.event_themes.length, 3);
list.props.onClose();
assert.equal(selection, null, "record list close remains functional");
let emptyClicked = false;
const emptySummary = Summary({ trends: { ...trends, event_overall: [] }, dailyDays: [], onEventRecords: () => { emptyClicked = true; } });
const emptyButton = findNodes(emptySummary, node => node.type === "button")[0].node;
assert.match(emptyButton.props["aria-label"], /できごと0件/);
emptyButton.props.onClick();
assert.ok(emptyClicked, "zero records still offers the existing empty list state");
console.log("Owner summary: event-card tap, correct dog/period filters, list close and zero-count entry passed; event table visible outside disclosures.");
console.log("Compact event table: exact counts, rounded and zero-rate safety, full labels, current period, selected ordering and record filters passed.");
module.exports = { sampleHtml };

const chartModule = load("components/insights/DailyCheckHistoryChart.tsx");
const Chart = chartModule.default;
const keys = chartModule.dailyChartMetrics.map(item => item.key);
assert.equal(new Set(chartModule.dailyChartMetrics.map(item => item.color)).size, 6);
const chartDays = ["2026-10-04", "2026-10-05", "2026-10-07"].map((local_date, i) => ({ local_date, ...Object.fromEntries(keys.map((key, j) => [key, (i + j) % 5 + 1])) }));
const chartProps = { days: chartDays, startDate: "2026-10-04", endDate: "2026-10-10" };
const chartHtml = renderToStaticMarkup(React.createElement(Chart, chartProps));
assert.equal((chartHtml.match(/data-metric=/g) || []).length, 6, "all six series shown initially");
assert.equal((chartHtml.match(/class="line"/g) || []).length, 12, "two segments per metric; previous and next recorded points connect across missing days");
assert.equal((chartHtml.match(/data-missing-date=/g) || []).length, 4);
assert.match(chartHtml, /data-missing-date="2026-10-06"/);
assert.match(chartHtml, /x1="69" y1="[\d.]+" x2="159"/, "line crosses missing day at x114 without inventing a data point");
assert.equal((chartHtml.match(/class="point"/g) || []).length, 18);
assert.equal((chartHtml.match(/scope="row"/g) || []).length, 6);
assert.equal((chartHtml.match(/<td>/g) || []).length, 42, "numeric table covers every item and every date");
assert.match(chartHtml, /全項目/);
assert.match(chartHtml, /数値の表を見る/);
assert.doesNotMatch(chartHtml, /NaN|Infinity/);
let selectedMetric = "all";
let selectedWeek = "current";
const swipeRef = { current: null };
const InteractiveChart = load("components/insights/DailyCheckHistoryChart.tsx", { ...React,
  useRef: () => swipeRef,
  useState: initial => initial === "all" ? [selectedMetric, next => { selectedMetric = next; }]
    : [selectedWeek, next => { selectedWeek = next; }],
}).default;
let chartTree = InteractiveChart(chartProps);
const activityButton = findNodes(chartTree, node => node.type === "button" && node.props.children === "活動")[0].node;
activityButton.props.onClick();
assert.equal(selectedMetric, "activity_score");
chartTree = InteractiveChart(chartProps);
assert.equal(findNodes(chartTree, node => node.props?.["data-metric"]).length, 1);
findNodes(chartTree, node => node.type === "button" && node.props.children === "全項目")[0].node.props.onClick();
assert.equal(findNodes(InteractiveChart(chartProps), node => node.props?.["data-metric"]).length, 6);
const emptyChart = renderToStaticMarkup(React.createElement(Chart, { ...chartProps, days: [] }));
assert.match(emptyChart, /Daily Checkはまだありません/);
assert.doesNotMatch(emptyChart, /class="point"|class="line"|NaN/);
assert.equal((emptyChart.match(/data-missing-date=/g) || []).length, 7);
const partialDays = chartDays.map(day => day.local_date === "2026-10-05" ? { ...day, activity_score: null } : day);
selectedMetric = "activity_score";
const partialTree = InteractiveChart({ ...chartProps, days: partialDays });
const partialLines = findNodes(partialTree, node => node.type === "line" && node.props.className === "line");
assert.equal(partialLines.length, 1);
assert.equal(partialLines[0].node.props.x1, 24);
assert.equal(partialLines[0].node.props.x2, 159);
assert.equal(findNodes(partialTree, node => node.props?.["data-missing-date"] === "2026-10-05").length, 1);
selectedMetric = "all";
const partialAll = InteractiveChart({ ...chartProps, days: partialDays });
assert.equal(findNodes(partialAll, node => node.props?.["data-missing-date"] === "2026-10-05").length, 0, "day with other scores is not a fully unrecorded day");
assert.doesNotMatch(chartHtml, /<caption|は未入力です/);
const priorDay = { local_date: "2026-09-29", ...Object.fromEntries(keys.map(key => [key, 5])) };
const bothWeeks = { ...chartProps, days: [...chartDays, priorDay] };
function swipe(tree, table, dx, dy = 0, scrollLeft = 0) {
  const surface = findNodes(tree, node => node.type === "div" && node.props.onTouchStart
    && (table ? node.props.role === "region" : node.props.role !== "region"))[0].node;
  surface.props.onTouchStart({ touches: [{ clientX: 100, clientY: 100 }], currentTarget: { scrollLeft, clientWidth: 320, scrollWidth: 410 } });
  surface.props.onTouchEnd({ changedTouches: [{ clientX: 100 + dx, clientY: 100 + dy }] });
}
swipe(InteractiveChart(bothWeeks), false, 80, 100);
assert.equal(selectedWeek, "current", "vertical scroll does not switch week");
swipe(InteractiveChart(bothWeeks), false, 80);
assert.equal(selectedWeek, "previous");
const previousTree = InteractiveChart(bothWeeks);
const previousSvg = findNodes(previousTree, node => node.type === "svg" && node.props.role === "img")[0].node;
assert.match(previousSvg.props["aria-label"], /2026-09-27から2026-10-03/);
assert.equal(findNodes(previousTree, node => node.type === "circle").length, 6);
const previousTable = findNodes(previousTree, node => node.type === "table")[0].node;
assert.match(previousTable.props["aria-label"], /2026-09-27から2026-10-03/);
assert.equal(findNodes(previousTable, node => node.type === "td" && node.props.children === 5).length, 6);
assert.equal(findNodes(previousTree, node => node.type === "strong" && node.props.children === "5.0").length, 1);
swipe(previousTree, true, -80, 0, 30);
assert.equal(selectedWeek, "previous", "table scroll inside its range does not change weeks");
swipe(previousTree, true, -80, 0, 90);
assert.equal(selectedWeek, "current", "swipe at table end synchronizes graph and table");
swipe(InteractiveChart(bothWeeks), true, 80);
assert.equal(selectedWeek, "previous", "table start can switch to previous week");
findNodes(InteractiveChart(bothWeeks), node => node.type === "button" && node.props.children === "今週 ›")[0].node.props.onClick();
assert.equal(selectedWeek, "current");
assert.equal(findNodes(InteractiveChart(bothWeeks), node => node.type === "circle").length, 18);
const acrossMonthTrends = { ...trends, current_start: "2026-12-29", as_of_local_date: "2027-01-04" };
const recordedDays = ["2026-12-30", "2027-01-01", "2027-01-04", "2027-01-04", "2026-12-20"].map(local_date => ({ local_date, ...Object.fromEntries(keys.map(key => [key, 3])) }));
const calendarSummary = Summary({ trends: acrossMonthTrends, dailyDays: recordedDays, onEventRecords: () => {} });
const dateMarks = findNodes(calendarSummary, node => node.type === "li" && "data-recorded" in node.props);
assert.equal(dateMarks.length, 7);
assert.equal(dateMarks.filter(({ node }) => node.props["data-recorded"]).length, 3, "distinct recorded days only, excluding outside period");
assert.equal(dateMarks[0].node.props["aria-label"], "2026-12-29（火）：未入力");
assert.equal(dateMarks[6].node.props["aria-label"], "2027-01-04（月）：記録済み");
const calendarHtml = renderToStaticMarkup(calendarSummary);
assert.match(calendarHtml, /<strong>3<em>\/7日<\/em><\/strong>/);
assert.doesNotMatch(calendarHtml, /insight-mini-progress/);
assert.equal((summaryHtml.match(/data-recorded="false"/g) || []).length, 7, "zero-day summary still shows all dates");
console.log("Daily Check: six series, switching, bridging recorded points, missing-date bands, no invented values, complete/partial/empty days and seven-date summary across month/year boundaries passed.");
