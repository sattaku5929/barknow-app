const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.join(__dirname, "..");
function load(relative, reactOverride = React) {
  const filename = path.join(root, relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = name => {
    if (name === "react") return reactOverride;
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
  event_themes: [], daily_metrics: [], handler_themes: [],
};
const Summary = load("components/insights/InsightDashboardSummary.tsx").default;
const summaryHtml = renderToStaticMarkup(React.createElement(Summary, { trends, dailyDays: [] }));
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
  assert.match(html, /aria-label="記録のサマリーと詳細"/);
  if (scenario.online && !scenario.loading && !scenario.error) {
    for (const title of ["今週のサマリー", "最近の記録", "詳しいデータを見る"]) assert.ok(html.includes(title));
  }
}
console.log("Owner report UI: removed overviews and coach invitation absent in all states; summary, records and details preserved.");
