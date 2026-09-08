import { analyzeResearchRuns, analysisToCsv } from "./research-analysis.js";

const root = document.querySelector("#analysis-root");
const fileInput = document.querySelector("#file-input");
const demoButton = document.querySelector("#demo-button");
const clearButton = document.querySelector("#clear-button");
let records = [];
let sourceLabel = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function demoRecord({ id, cohort, baseline, post, route, branch, rewinds, ratings, useful, confusing }) {
  return {
    version: "0.5.0-demo",
    state: {
      evidence: route.includes("检查损失") ? ["pastLosses", "deposit"] : ["friendPraise"],
      rewinds,
      challengeResult: { title: branch },
      history: [
        { type: "storyScene", choiceId: route.includes("检查损失") ? "inspectPastLoss" : "askPreference" },
        { type: "storyScene", choiceId: route.includes("边界定金") ? "boundedDeposit" : "freeEverything" },
      ],
      research: {
        mode: true,
        runId: id,
        profile: { cohort, experience: cohort === "大学生" ? "没有实际创业经历" : "做过副业或小项目" },
        baseline: { score: baseline.length, total: 7, dimensionIds: baseline },
        post: { score: post.length, total: 7, dimensionIds: post },
        feedback: { agency: ratings[0], clarity: ratings[1], engagement: ratings[2], useful, confusing },
      },
    },
  };
}

const demoRecords = [
  demoRecord({
    id: "DEMO-A01", cohort: "大学生", baseline: ["stopping"],
    post: ["reality", "payment", "experiment", "economics", "risk", "alternatives", "stopping"],
    route: "检查损失 → 边界定金", branch: "可靠流程", rewinds: 0, ratings: [5, 5, 4],
    useful: "看到前一幕的账本证据直接改变定金结果。", confusing: "认知云图一开始不知道能不能点击。",
  }),
  demoRecord({
    id: "DEMO-B02", cohort: "在职员工", baseline: ["payment", "alternatives"],
    post: ["reality", "payment", "experiment", "economics", "alternatives", "stopping"],
    route: "询问偏好 → 免费全包", branch: "有效试点", rewinds: 1, ratings: [4, 4, 4],
    useful: "免费试点能学到交付，但不能证明付款。", confusing: "部分结果页一次出现的信息太多。",
  }),
  demoRecord({
    id: "DEMO-C03", cohort: "离职或待业", baseline: ["experiment", "economics", "risk"],
    post: ["reality", "payment", "experiment", "economics", "risk", "stopping"],
    route: "检查损失 → 免费全包", branch: "巨构空转", rewinds: 1, ratings: [3, 5, 3],
    useful: "失败说明了为什么错，不只是让我换选项。", confusing: "想看到退出路线更长远的后续。",
  }),
];

function emptyView() {
  root.innerHTML = `
    <section class="analysis-empty panel">
      <div>∴</div><h2>还没有测试记录</h2>
      <p>选择多份玩家导出的JSON，或先载入演示记录查看聚合结果。</p>
    </section>`;
}

function barRow(stat, participants) {
  return `
    <article class="dimension-row">
      <strong>${stat.label}</strong>
      <div class="dual-bars"><span style="width:${stat.baselinePct}%"></span><i style="width:${stat.postPct}%"></i></div>
      <small>前 ${stat.baseline}/${participants} · 后 ${stat.post}/${participants} · ${stat.change >= 0 ? "+" : ""}${stat.change}</small>
    </article>`;
}

function renderAnalysis() {
  if (!records.length) return emptyView();
  const analysis = analyzeResearchRuns(records);
  if (!analysis.participants) {
    root.innerHTML = `<section class="analysis-empty panel"><div>!</div><h2>没有可分析的完整记录</h2><p>${analysis.rejected.map((item) => `第${item.index + 1}份：${escapeHtml(item.reason)}`).join("；")}</p></section>`;
    return;
  }
  const branchTotal = Object.values(analysis.branchCounts).reduce((sum, count) => sum + count, 0);
  root.innerHTML = `
    <div class="analysis-source"><span>${escapeHtml(sourceLabel)}</span><b>${analysis.participants}份完成记录</b>${analysis.rejected.length ? `<em>${analysis.rejected.length}份未纳入：未完成或格式不符</em>` : ""}</div>
    <section class="summary-grid">
      <article class="panel"><span>完成测试者</span><strong>${analysis.participants}</strong><small>导入 ${analysis.imported} 份</small></article>
      <article class="panel"><span>平均新增维度</span><strong>${analysis.averages.delta >= 0 ? "+" : ""}${analysis.averages.delta}</strong><small>前 ${analysis.averages.baseline} → 后 ${analysis.averages.post}</small></article>
      <article class="panel"><span>主观能动性</span><strong>${analysis.averages.agency}</strong><small>满分5 · 仅作体验指标</small></article>
      <article class="panel"><span>因果清晰度</span><strong>${analysis.averages.clarity}</strong><small>继续意愿 ${analysis.averages.engagement}/5</small></article>
    </section>
    <div class="analysis-two-column">
      <section class="panel analysis-panel">
        <div class="analysis-heading"><div><div class="eyebrow">前后对照</div><h2>玩家主动纳入的因果维度</h2></div><div class="bar-legend"><span>游玩前</span><i>迁移案例</i></div></div>
        <div class="dimension-list">${analysis.dimensionStats.map((stat) => barRow(stat, analysis.participants)).join("")}</div>
      </section>
      <section class="panel analysis-panel">
        <div class="analysis-heading"><div><div class="eyebrow">不是通关率</div><h2>最终剧情路线</h2></div></div>
        <div class="branch-list">${Object.entries(analysis.branchCounts).map(([title, count]) => `<article><span>${escapeHtml(title)}</span><div><i style="width:${Math.round(count / branchTotal * 100)}%"></i></div><strong>${count}</strong></article>`).join("")}</div>
        <p class="analysis-note">路线分布用于发现玩家如何理解世界，不把“好结局比例”直接当作学习效果。</p>
      </section>
    </div>
    <section class="panel analysis-panel runs-panel">
      <div class="analysis-heading"><div><div class="eyebrow">逐局检查</div><h2>匿名测试路线</h2></div><button id="csv-button" class="ghost-button">导出汇总CSV</button></div>
      <div class="runs-table"><table><thead><tr><th>测试编号</th><th>背景</th><th>前→后</th><th>剧情路线</th><th>证据</th><th>回溯</th><th>能动/清晰/继续</th></tr></thead><tbody>${analysis.rows.map((row) => `<tr><td>${escapeHtml(row.runId)}</td><td>${escapeHtml(row.cohort)}</td><td><b>${row.baselineScore}→${row.postScore}</b> <em>${row.delta >= 0 ? "+" : ""}${row.delta}</em></td><td>${escapeHtml(row.route)}</td><td>${row.evidenceStrength}</td><td>${row.rewinds}</td><td>${row.agency}/${row.clarity}/${row.engagement}</td></tr>`).join("")}</tbody></table></div>
    </section>
    <section class="feedback-columns">
      <div class="panel analysis-panel"><div class="eyebrow">最有用的时刻</div>${analysis.rows.map((row) => `<blockquote><p>“${escapeHtml(row.useful || "未填写")}”</p><span>${escapeHtml(row.runId)}</span></blockquote>`).join("")}</div>
      <div class="panel analysis-panel"><div class="eyebrow">困惑、无聊或像考试</div>${analysis.rows.map((row) => `<blockquote><p>“${escapeHtml(row.confusing)}”</p><span>${escapeHtml(row.runId)}</span></blockquote>`).join("")}</div>
    </section>`;

  document.querySelector("#csv-button")?.addEventListener("click", () => {
    const blob = new Blob([`\uFEFF${analysisToCsv(analysis)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "在答案之前-匿名测试汇总.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

fileInput.addEventListener("change", async () => {
  const files = [...fileInput.files];
  const parsed = await Promise.all(files.map(async (file) => {
    try { return JSON.parse(await file.text()); } catch { return { invalidFile: file.name }; }
  }));
  records = parsed;
  sourceLabel = `本地导入 · ${files.length}个文件`;
  renderAnalysis();
});

demoButton.addEventListener("click", () => {
  records = structuredClone(demoRecords);
  sourceLabel = "演示数据 · 非真实玩家";
  renderAnalysis();
});

clearButton.addEventListener("click", () => {
  records = [];
  sourceLabel = "";
  fileInput.value = "";
  renderAnalysis();
});

renderAnalysis();
