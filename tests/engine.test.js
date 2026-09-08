import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  challengeAvailability,
  createInitialState,
  endingSummary,
  evidenceScore,
  evaluateUnderstanding,
  evaluateTransferResponse,
  recordPostTransfer,
  recordResearchFeedback,
  researchMetrics,
  resolveWorldChallenge,
  rewindWorldChallenge,
  resolveStoryChoice,
  setHypothesis,
  startResearchSession,
  unlockedKnowledgeIds,
} from "../js/engine.js";
import { challengeOutcomes } from "../js/content.js";
import { analysisToCsv, analyzeResearchRuns, validateResearchExport } from "../js/research-analysis.js";

test("exploration spends the shared time resource and adds evidence", () => {
  const initial = createInitialState();
  const { state, error } = applyAction(initial, "observe");
  assert.equal(error, null);
  assert.equal(state.day, 3);
  assert.equal(state.money, 6720);
  assert.deepEqual(state.evidence, ["observedDelay"]);
  assert.equal(evidenceScore(state), 2);
});

test("forming a hypothesis records confidence without spending time", () => {
  const initial = createInitialState();
  const next = setHypothesis(initial, "pain", 60);
  assert.equal(next.day, 1);
  assert.equal(next.activeHypothesis, "pain");
  assert.equal(next.confidence, 60);
  assert.equal(next.history[0].type, "hypothesis");
});

test("a values-conflicting suggestion is refused and damages trust", () => {
  const initial = createInitialState();
  const { state } = applyAction(initial, "unsafeData");
  assert.equal(state.day, 1);
  assert.equal(state.trust, 64);
  assert.equal(state.lastReport.refused, true);
});

test("premature full product build consumes time, money, and trust", () => {
  let state = createInitialState();
  state = applyAction(state, "observe").state;
  state = applyAction(state, "fullBuild").state;
  assert.equal(state.day, 13);
  assert.equal(state.money, 4320);
  assert.equal(state.trust, 55);
  assert.equal(state.flags.fullBuildFailed, true);
});

test("a failed payment request can be retried after collecting stronger evidence", () => {
  let state = createInitialState();
  state = applyAction(state, "observe").state;
  state = applyAction(state, "concierge").state;
  state = applyAction(state, "askDeposit").state;
  assert.equal(state.flags.depositTaken, undefined);
  assert.equal(state.completed.includes("askDeposit"), false);

  state = applyAction(state, "pastBehavior").state;
  state = applyAction(state, "askDeposit").state;
  assert.equal(state.flags.depositTaken, true);
});

test("low trust creates additional conflict around unsupported large bets", () => {
  let state = createInitialState();
  state.trust = 45;
  state = applyAction(state, "observe").state;
  const beforeDay = state.day;
  state = applyAction(state, "fullBuild").state;
  assert.equal(state.day, beforeDay);
  assert.equal(state.lastReport.refused, true);
  assert.match(state.lastReport.result, /拒绝执行/);
});

test("strong evidence can lead to a deposit and paid pilot path", () => {
  let state = createInitialState();
  state = applyAction(state, "observe").state;
  state = applyAction(state, "pastBehavior").state;
  state = applyAction(state, "concierge").state;
  state = applyAction(state, "askDeposit").state;
  assert.equal(state.flags.depositTaken, true);
  assert.equal(state.business.revenue, 300);
  assert.ok(state.evidence.includes("deposit"));

  state = applyAction(state, "paidPilot").state;
  assert.equal(state.business.paidPilots, 1);
  assert.equal(state.business.revenue, 1200);
});

test("ending separates business progress from learning capability", () => {
  let state = createInitialState();
  state = applyAction(state, "observe").state;
  state = applyAction(state, "pastBehavior").state;
  const summary = endingSummary(state);
  assert.match(summary.businessStage, /商业证据/);
  assert.match(summary.capability, /证据|直觉/);
});

test("side experiences unlock different nodes in the world model", () => {
  let state = createInitialState();
  assert.equal(challengeAvailability(state).allowed, false);
  state = applyAction(state, "pastBehavior").state;
  state = applyAction(state, "competitors").state;
  const unlocked = unlockedKnowledgeIds(state);
  assert.ok(unlocked.includes("realDemand"));
  assert.ok(unlocked.includes("commodityShift"));
  assert.equal(challengeAvailability(state).allowed, true);
});

test("free-form understanding matches causal concepts instead of an exact sentence", () => {
  const analysis = evaluateUnderstanding(
    "客户过去行为已经出现漏单，平台免费说明通用工具正在同质化，但我们仍要核算付费、成本，并保留人工审核和隐私边界。",
  );
  assert.deepEqual(
    new Set(analysis.concepts),
    new Set(["demand", "economics", "substitutes", "responsibility"]),
  );
});

test("weak understanding plus a large product bet creates a failure branch", () => {
  let state = createInitialState();
  state = applyAction(state, "observe").state;
  const before = { day: state.day, money: state.money, trust: state.trust };
  const result = resolveWorldChallenge(
    state,
    "对方来势很大，我们应该马上做一个功能更多的软件去正面击败它。",
    "buildProduct",
  );
  assert.equal(result.error, null);
  assert.equal(result.state.challengeResult.title, "巨构空转");
  assert.equal(result.state.challengeResult.band, "weak");
  assert.equal(result.state.day, before.day + 12);
  assert.equal(result.state.money, before.money - 2600);
  assert.ok(result.state.trust < before.trust);
});

test("strong evidence and causal understanding unlock a reliable service branch", () => {
  let state = createInitialState();
  for (const actionId of ["pastBehavior", "competitors", "privacy", "concierge", "askDeposit"]) {
    state = applyAction(state, actionId).state;
  }
  const result = resolveWorldChallenge(
    state,
    "过去行为证明客户确有漏单和真实问题；通用工具降价只是功能商品化。我们要围绕客户付费、成本与利润，保留人工审核、隐私授权和结果责任。",
    "productizedService",
  );
  assert.equal(result.error, null);
  assert.equal(result.state.challengeResult.title, "可靠流程");
  assert.equal(result.state.challengeResult.band, "strong");
  assert.equal(result.state.challengeResult.verifiedConcepts.length, 4);
});

test("challenge content provides twelve authored narrative outcomes", () => {
  const titles = Object.values(challengeOutcomes).flatMap((bands) =>
    Object.values(bands).map((outcome) => outcome.title),
  );
  assert.equal(titles.length, 12);
  assert.equal(new Set(titles).size, 12);
});

test("cognitive rewind restores resources but retains the causal lesson", () => {
  let state = createInitialState();
  state = applyAction(state, "observe").state;
  const checkpoint = { day: state.day, money: state.money, trust: state.trust };
  state = resolveWorldChallenge(
    state,
    "我们应该马上做得更大，不需要继续区分客户问题和平台变化。",
    "buildProduct",
  ).state;
  const rewound = rewindWorldChallenge(state);
  assert.equal(rewound.error, null);
  assert.equal(rewound.state.day, checkpoint.day);
  assert.equal(rewound.state.money, checkpoint.money);
  assert.equal(rewound.state.trust, checkpoint.trust);
  assert.equal(rewound.state.challengeCompleted, false);
  assert.equal(rewound.state.rewinds, 1);
  assert.match(rewound.state.lastChallengeLesson, /客户|责任|交易/);
});

test("the first story scene turns a concrete question into evidence and relationship capital", () => {
  let state = createInitialState();
  const beforeTang = state.relationships.tangMan;
  state = resolveStoryChoice(state, "inspectPastLoss").state;
  assert.equal(state.story.sceneIndex, 1);
  assert.ok(state.evidence.includes("pastLosses"));
  assert.equal(state.relationships.tangMan, beforeTang + 10);
  assert.equal(state.day, 3);
  assert.match(state.story.lastResult.cause, /过去行为/);
});

test("a bounded offer becomes payment only when the earlier scene found a real loss", () => {
  let supported = createInitialState();
  supported = resolveStoryChoice(supported, "inspectPastLoss").state;
  supported = resolveStoryChoice(supported, "boundedDeposit").state;
  assert.equal(supported.story.lastResult.branch, "evidenceSupported");
  assert.equal(supported.flags.depositTaken, true);
  assert.ok(supported.evidence.includes("deposit"));

  let unsupported = createInitialState();
  unsupported = resolveStoryChoice(unsupported, "askPreference").state;
  unsupported = resolveStoryChoice(unsupported, "boundedDeposit").state;
  assert.equal(unsupported.story.lastResult.branch, "unsupportedAsk");
  assert.equal(unsupported.flags.depositTaken, undefined);
  assert.ok(!unsupported.evidence.includes("deposit"));
});

test("the three-act route carries story evidence into the external challenge", () => {
  let state = createInitialState();
  state = resolveStoryChoice(state, "inspectPastLoss").state;
  state = resolveStoryChoice(state, "boundedDeposit").state;
  assert.equal(state.story.sceneIndex, 2);
  state = resolveWorldChallenge(
    state,
    "客户过去行为证明真实漏单；平台免费意味着通用工具商品化。继续服务必须有付费、成本和利润，也要保留人工审核、隐私授权和责任。",
    "productizedService",
  ).state;
  assert.equal(state.challengeResult.title, "可靠流程");
  assert.ok(state.relationships.tangMan > 60);
});

test("transfer responses are scored by visible reasoning dimensions", () => {
  const result = evaluateTransferResponse(
    "先访谈餐馆过去发生的损失，再用小范围试点验证是否愿意付费；核算人工成本和平台替代，最多投入两周并设置停止条件。",
  );
  assert.ok(result.dimensionIds.includes("reality"));
  assert.ok(result.dimensionIds.includes("payment"));
  assert.ok(result.dimensionIds.includes("experiment"));
  assert.ok(result.dimensionIds.includes("economics"));
  assert.ok(result.dimensionIds.includes("alternatives"));
  assert.ok(result.dimensionIds.includes("stopping"));
});

test("a research session preserves baseline, post-transfer, and feedback separately", () => {
  let state = createInitialState();
  let result = startResearchSession(state, {
    runId: "T-test-001",
    cohort: "大学生",
    experience: "没有实际创业经历",
    baselineText: "先问同学是否需要，然后做一个版本看看；如果一个月没有人使用就停止。",
    startedAt: "2026-09-09T00:00:00.000Z",
  });
  assert.equal(result.error, null);
  state = result.state;
  assert.equal(state.research.mode, true);
  assert.ok(state.research.baseline.score >= 1);

  result = recordPostTransfer(
    state,
    "访谈餐馆过去的实际损失和预算，用带定金的小范围试点验证付费；核算人工、获客和交付成本，检查平台替代、隐私错误，并设置两周止损上限。",
  );
  assert.equal(result.error, null);
  state = result.state;
  assert.ok(state.research.post.score > state.research.baseline.score);

  result = recordResearchFeedback(state, {
    agency: 4,
    clarity: 5,
    engagement: 4,
    useful: "定金失败会解释缺失证据。",
    confusing: "部分文字有点多。",
    completedAt: "2026-09-09T00:30:00.000Z",
  });
  assert.equal(result.error, null);
  assert.equal(result.state.research.feedback.clarity, 5);
  assert.equal(result.state.research.completedAt, "2026-09-09T00:30:00.000Z");
});

test("research metrics describe behavior without changing simulation results", () => {
  let state = createInitialState();
  state = applyAction(state, "observe").state;
  state = resolveStoryChoice(state, "inspectPastLoss").state;
  const metrics = researchMetrics(state);
  assert.equal(metrics.explorationCount, 1);
  assert.equal(metrics.storyScenes, 1);
  assert.equal(metrics.evidenceCount, 2);
  assert.equal(metrics.day, state.day);
});

function completedResearchRecord(id, baselineIds, postIds, branch = "可靠流程") {
  return {
    version: "0.5.0",
    state: {
      evidence: ["pastLosses", "deposit"],
      rewinds: 0,
      challengeResult: { title: branch },
      history: [
        { type: "storyScene", choiceId: "inspectPastLoss" },
        { type: "storyScene", choiceId: "boundedDeposit" },
      ],
      research: {
        mode: true,
        runId: id,
        profile: { cohort: "大学生", experience: "没有实际创业经历" },
        baseline: { score: baselineIds.length, total: 7, dimensionIds: baselineIds },
        post: { score: postIds.length, total: 7, dimensionIds: postIds },
        feedback: { agency: 4, clarity: 5, engagement: 4, useful: "因果清楚", confusing: "文字较多" },
      },
    },
  };
}

test("research exports reject incomplete sessions", () => {
  const incomplete = completedResearchRecord("T-incomplete", ["reality"], ["reality"]);
  incomplete.state.research.feedback = null;
  assert.equal(validateResearchExport(incomplete).valid, false);
});

test("research dashboard aggregates dimension change, branches, and ratings", () => {
  const records = [
    completedResearchRecord("T-01", ["stopping"], ["reality", "payment", "experiment", "stopping"]),
    completedResearchRecord("T-02", ["payment", "alternatives"], ["reality", "payment", "economics", "alternatives", "stopping"], "有效试点"),
  ];
  const analysis = analyzeResearchRuns(records);
  assert.equal(analysis.participants, 2);
  assert.equal(analysis.averages.baseline, 1.5);
  assert.equal(analysis.averages.post, 4.5);
  assert.equal(analysis.averages.delta, 3);
  assert.equal(analysis.branchCounts["可靠流程"], 1);
  assert.equal(analysis.branchCounts["有效试点"], 1);
  assert.equal(analysis.dimensionStats.find((item) => item.id === "reality").post, 2);
});

test("aggregate CSV safely quotes qualitative feedback", () => {
  const record = completedResearchRecord("T-CSV", ["reality"], ["reality", "payment"]);
  record.state.research.feedback.confusing = '文字很多，"像报告"';
  const csv = analysisToCsv(analyzeResearchRuns([record]));
  assert.match(csv, /T-CSV/);
  assert.match(csv, /""像报告""/);
});
