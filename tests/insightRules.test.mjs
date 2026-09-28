import assert from "node:assert/strict";
import test from "node:test";
import { evidenceLevel, eligiblePeriods, insightCandidates } from "../lib/insights/rules.ts";

const theme = (period, total, concern, success = total - concern) => ({
  period, theme_key: "dog_reaction", total_count: total,
  success_count: success, neutral_count: total - concern - success, concern_count: concern,
  success_rate: total ? 100 * success / total : 0,
  neutral_rate: total ? 100 * (total - concern - success) / total : 0,
  concern_rate: total ? 100 * concern / total : 0,
});
const snapshot = (event_themes, handlers = [], daily_metrics = []) => ({
  event_themes, handlers, daily_metrics,
});
const labels = () => "他の犬への反応";

test("件数が3未満なら候補を出さず、3/6/10の段階を区別する", () => {
  assert.deepEqual([2, 3, 6, 10].map(evidenceLevel),
    ["collecting", "reference", "trend", "comparison"]);
  assert.deepEqual(insightCandidates(snapshot([theme("current", 2, 1)]), labels), []);
  assert.equal(insightCandidates(snapshot([theme("current", 3, 1)]), labels)[0].kind, "reference");
});

test("期間比較は両期間3件以上かつ合計10件以上だけ", () => {
  assert.equal(eligiblePeriods(7, 2), false);
  assert.equal(eligiblePeriods(3, 3), false);
  assert.equal(eligiblePeriods(7, 3), true);
  const missing = insightCandidates(snapshot([theme("current", 10, 2), theme("previous", 2, 2)]), labels);
  assert.ok(!missing.some((row) => row.kind === "period"));
  const comparison = insightCandidates(snapshot([theme("current", 7, 2), theme("previous", 3, 3)]), labels);
  const candidate = comparison.find((row) => row.kind === "period");
  assert.ok(candidate);
  assert.match(candidate.evidence, /2\/7件.*3\/3件/);
  assert.doesNotMatch(candidate.text, /改善|悪化|原因/);
});

test("担当者は各3件以上、偏りが3倍以内、全体10件以上だけ比較", () => {
  const handler = (id, total, success, archived = false) => ({
    ...theme("current", total, total - success, success),
    handled_by_member_id: id, display_name: id, archived,
  });
  const accepted = insightCandidates(snapshot([theme("current", 10, 3)], [
    handler("パパ", 6, 5, true), handler("ママ", 4, 1),
  ]), labels);
  assert.equal(accepted.filter((row) => row.kind === "handler").length, 1);
  assert.match(accepted.find((row) => row.kind === "handler").text, /パパ（削除済み）/);
  const insufficient = insightCandidates(snapshot([theme("current", 10, 3)], [
    handler("パパ", 8, 6), handler("ママ", 2, 0),
  ]), labels);
  assert.ok(!insufficient.some((row) => row.kind === "handler"));
  const imbalanced = insightCandidates(snapshot([theme("current", 14, 4)], [
    handler("パパ", 11, 9), handler("ママ", 3, 0),
  ]), labels);
  assert.ok(!imbalanced.some((row) => row.kind === "handler"));
  const validInnerPair = insightCandidates(snapshot([theme("current", 24, 6)], [
    handler("多数", 16, 15), handler("中間", 5, 3), handler("少数", 3, 1),
  ]), labels);
  assert.ok(validInnerPair.some((row) => row.kind === "handler" && row.handlerIds.includes("中間") && !row.handlerIds.includes("多数")));
});

test("Daily CheckはNULLに対応する集計結果から、両期間の入力日数で判定する", () => {
  const metric = (period, entered_days, average_score) => ({
    period, metric_key: "calmness_score", entered_days, average_score,
    median_score: average_score, minimum_score: 1, maximum_score: 5,
  });
  assert.ok(!insightCandidates(snapshot([], [], [metric("current", 7, 4), metric("previous", 2, 2)]), labels)
    .some((row) => row.kind === "daily"));
  const candidates = insightCandidates(snapshot([], [], [metric("current", 7, 4), metric("previous", 3, 2)]), labels);
  assert.equal(candidates.filter((row) => row.kind === "daily").length, 1);
});
