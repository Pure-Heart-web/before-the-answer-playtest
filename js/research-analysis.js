import { evidenceCatalog, transferDimensions } from "./content.js";

export function validateResearchExport(record) {
  if (!record || typeof record !== "object") return { valid: false, reason: "不是JSON对象" };
  if (!record.state || typeof record.state !== "object") return { valid: false, reason: "缺少游戏状态" };
  const research = record.state.research;
  if (!research?.mode) return { valid: false, reason: "不是匿名测试模式记录" };
  if (!research.runId || !research.baseline) return { valid: false, reason: "缺少测试编号或基线" };
  if (!research.post || !research.feedback) return { valid: false, reason: "测试尚未完成" };
  return { valid: true, reason: "" };
}

function average(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function pct(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

function routeLabel(state) {
  const choices = state.history
    .filter((item) => item.type === "storyScene")
    .map((item) => item.choiceId);
  const labels = {
    askPreference: "询问偏好",
    inspectPastLoss: "检查损失",
    demoImmediately: "立即演示",
    boundedDeposit: "边界定金",
    freeEverything: "免费全包",
    promiseAutonomy: "承诺自动化",
  };
  return [...choices.map((id) => labels[id] ?? id), state.challengeResult?.title]
    .filter(Boolean)
    .join(" → ");
}

export function analyzeResearchRuns(records) {
  const accepted = [];
  const rejected = [];
  records.forEach((record, index) => {
    const validation = validateResearchExport(record);
    if (validation.valid) accepted.push(record);
    else rejected.push({ index, reason: validation.reason });
  });

  const dimensionStats = transferDimensions.map((dimension) => {
    const baseline = accepted.filter((record) =>
      record.state.research.baseline.dimensionIds.includes(dimension.id),
    ).length;
    const post = accepted.filter((record) =>
      record.state.research.post.dimensionIds.includes(dimension.id),
    ).length;
    return {
      id: dimension.id,
      label: dimension.label,
      baseline,
      post,
      baselinePct: pct(baseline, accepted.length),
      postPct: pct(post, accepted.length),
      change: post - baseline,
    };
  });

  const branchCounts = {};
  accepted.forEach((record) => {
    const title = record.state.challengeResult?.title ?? "未完成主线";
    branchCounts[title] = (branchCounts[title] ?? 0) + 1;
  });

  const rows = accepted.map((record) => {
    const state = record.state;
    const research = state.research;
    const actionHistory = state.history.filter((item) => item.actionId);
    return {
      runId: research.runId,
      cohort: research.profile?.cohort ?? "未填写",
      experience: research.profile?.experience ?? "未填写",
      baselineScore: research.baseline.score,
      postScore: research.post.score,
      delta: research.post.score - research.baseline.score,
      route: routeLabel(state),
      evidenceStrength: state.evidence.reduce(
        (sum, id) => sum + (evidenceCatalog[id]?.strength ?? 0),
        0,
      ),
      freeActions: actionHistory.length,
      rewinds: state.rewinds ?? 0,
      agency: Number(research.feedback.agency),
      clarity: Number(research.feedback.clarity),
      engagement: Number(research.feedback.engagement),
      useful: research.feedback.useful,
      confusing: research.feedback.confusing,
    };
  });

  return {
    imported: records.length,
    participants: accepted.length,
    rejected,
    dimensionStats,
    branchCounts,
    averages: {
      baseline: average(rows.map((row) => row.baselineScore)),
      post: average(rows.map((row) => row.postScore)),
      delta: average(rows.map((row) => row.delta)),
      agency: average(rows.map((row) => row.agency)),
      clarity: average(rows.map((row) => row.clarity)),
      engagement: average(rows.map((row) => row.engagement)),
    },
    rows,
  };
}

function csvCell(value) {
  const stringValue = String(value ?? "");
  return `"${stringValue.replaceAll('"', '""')}"`;
}

export function analysisToCsv(analysis) {
  const headers = ["测试编号", "背景", "经历", "基线维度", "迁移维度", "变化", "剧情路线", "证据强度", "自由行动", "回溯", "能动性", "因果清晰", "继续意愿", "最有用", "最困惑"];
  const lines = analysis.rows.map((row) => [
    row.runId, row.cohort, row.experience, row.baselineScore, row.postScore, row.delta,
    row.route, row.evidenceStrength, row.freeActions, row.rewinds, row.agency, row.clarity,
    row.engagement, row.useful, row.confusing,
  ].map(csvCell).join(","));
  return [headers.map(csvCell).join(","), ...lines].join("\n");
}
