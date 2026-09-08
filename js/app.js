import {
  actions,
  characters,
  evidenceCatalog,
  hypotheses,
  knowledgeNodes,
  openingLines,
  protagonist,
  storyScenes,
  transferDimensions,
  transferScenarios,
  worldChallenge,
} from "./content.js";
import {
  applyAction,
  availability,
  challengeAvailability,
  createInitialState,
  currentStoryScene,
  endGame,
  endingSummary,
  evidenceScore,
  evaluateTransferResponse,
  exportRun,
  hypothesisEvidence,
  resolveWorldChallenge,
  rewindWorldChallenge,
  resolveStoryChoice,
  recordPostTransfer,
  recordResearchFeedback,
  researchMetrics,
  setHypothesis,
  startResearchSession,
  unlockedKnowledgeIds,
} from "./engine.js";

const STORAGE_KEY = "before-the-answer-v04";
const app = document.querySelector("#app");
let state = loadState();
const requestedTestEntry = new URLSearchParams(window.location.search).get("test") === "1";
if (requestedTestEntry) state.started = true;
let modal = requestedTestEntry ? "research" : state.started ? null : "opening";
let actionFilter = "全部";
let challengeError = "";
let researchError = "";
let challengeDraft = "";
let challengeDirection = "";
let storyChoice = "";
let researchDraft = {
  cohort: "大学生",
  experience: "没有实际创业经历",
  baseline: "",
  post: "",
  agency: "",
  clarity: "",
  engagement: "",
  useful: "",
  confusing: "",
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : createInitialState();
  } catch {
    return createInitialState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentHypothesis() {
  return hypotheses.find((item) => item.id === state.activeHypothesis);
}

function meter(label, value, max, tone = "blue") {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `
    <div class="meter-block">
      <div class="meter-label"><span>${label}</span><strong>${value}</strong></div>
      <div class="meter-track"><i class="${tone}" style="width:${pct}%"></i></div>
    </div>`;
}

function renderHeader() {
  const remaining = Math.max(0, state.maxDay - state.day + 1);
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">答</div>
        <div><p>创业认知模拟 · v0.6</p><h1>在答案之前</h1></div>
      </div>
      <div class="time-orbit" aria-label="剩余时间">
        <span>毕业倒计时</span><strong>${remaining}</strong><em>天</em>
      </div>
      <div class="top-actions">
        <button class="ghost-button research-button ${state.research?.mode ? "active" : ""}" data-command="research">${state.research?.mode ? "测试记录" : "用户测试"}</button>
        <button class="ghost-button" data-command="knowledge">认知云图</button>
        <button class="ghost-button" data-command="hypothesis">形成假设</button>
        <button class="ghost-button" data-command="export">导出记录</button>
        <button class="icon-button" data-command="reset" title="重新开始">↺</button>
      </div>
    </header>`;
}

function renderProtagonist() {
  const hypothesis = currentHypothesis();
  return `
    <section class="panel protagonist-panel">
      <div class="portrait-wrap">
        <div class="portrait">${protagonist.portrait}</div>
        <span class="status-dot"></span>
      </div>
      <div class="protagonist-copy">
        <div class="eyebrow">你的协作对象</div>
        <h2>${protagonist.name}<small>${protagonist.age}岁 · ${protagonist.role}</small></h2>
        <div class="traits">${protagonist.traits.map((t) => `<span>${t}</span>`).join("")}</div>
        <blockquote>“${state.lastReport?.quote ?? "你可以建议我，但最后迈出这一步的人是我。"}”</blockquote>
      </div>
      <div class="relationship">
        ${meter("对你的信赖", state.trust, 100, state.trust < 45 ? "red" : "gold")}
        ${meter("当前精力", state.energy, 100, state.energy < 25 ? "red" : "blue")}
        <p>${
          state.trust >= 75
            ? "愿意共同承担判断"
            : state.trust >= 50
              ? "会要求你解释理由"
              : "对你的建议保持警惕"
        }</p>
      </div>
      <div class="active-belief ${hypothesis ? "has-belief" : ""}">
        <span>当前工作假设</span>
        <strong>${hypothesis?.title ?? "尚未形成"}</strong>
        <p>${hypothesis ? `置信度 ${state.confidence}%` : "继续探索，或打开假设窗口"}</p>
      </div>
    </section>`;
}

function renderWorld() {
  const latest = state.worldEvents.at(-1);
  const remaining = Math.max(0, state.maxDay - state.day + 1);
  const challengeStatus = challengeAvailability(state);
  const storyScene = currentStoryScene(state);
  return `
    <section class="story-stage panel">
      <div class="stage-gradient"></div>
      <div class="scene-kicker">DAY ${String(state.day).padStart(2, "0")} · 毕业前 ${remaining} 天</div>
      <h2>${latest?.title ?? "机会没有写着答案"}</h2>
      <p>${
        latest?.body ??
        "校园商业街的店主们开始使用各种AI工具。但工具变便宜，并不意味着客户的问题已经被解决。你们需要决定：今天继续了解，还是用现实行动换取更强的证据。"
      }</p>
      <div class="challenge-callout ${(storyScene || challengeStatus.allowed) ? "ready" : ""}">
        <div><span>${storyScene ? storyScene.chapter : "第三幕 · 外部挑战"}</span><strong>${storyScene?.title ?? (state.challengeCompleted ? state.challengeResult?.title : "零价浪潮")}</strong><small>${storyScene ? `${storyScene.location} · 剧情选择会消耗同一个时间池` : state.challengeCompleted ? "你的认识已经改变了这条主线" : challengeStatus.reason}</small></div>
        <button data-command="${storyScene ? "story" : state.challengeCompleted ? "challenge-result" : "challenge"}" ${!storyScene && !challengeStatus.allowed && !state.challengeCompleted ? "disabled" : ""}>${storyScene ? "进入当前剧情" : state.challengeCompleted ? "查看分支结果" : "带着当前理解进入"} <i>→</i></button>
      </div>
      <div class="scene-foot">
        <span>现金 <strong>¥${state.money.toLocaleString("zh-CN")}</strong></span>
        <span>证据强度 <strong>${evidenceScore(state)}</strong></span>
        <span>已获收入 <strong>¥${state.business.revenue}</strong></span>
        <span>经营净额 <strong class="${state.business.revenue - state.business.costs < 0 ? "negative" : ""}">¥${state.business.revenue - state.business.costs}</strong></span>
      </div>
    </section>`;
}

function renderCastPanel() {
  const introduced = new Set(["tangMan", "xuLan", "chengYu"]);
  if ((state.story?.sceneIndex ?? 0) >= storyScenes.length) introduced.add("guYao");
  return `
    <section class="panel cast-panel">
      <div class="section-heading compact">
        <div><div class="eyebrow">可调动的社会资源</div><h2>人物关系</h2></div>
        <strong>${introduced.size}</strong>
      </div>
      <div class="cast-list">
        ${[...introduced].map((id) => {
          const person = characters[id];
          const relation = state.relationships?.[id] ?? 0;
          return `<article><i>${person.mark}</i><div><strong>${person.name}</strong><span>${person.role}</span><small>${person.interest}</small></div><b>${relation}</b></article>`;
        }).join("")}
      </div>
    </section>`;
}

function renderResearchStatus() {
  if (!state.research?.mode) return "";
  const metrics = researchMetrics(state);
  const stage = state.research.feedback
    ? "测试已完成"
    : state.research.post
      ? "等待体验反馈"
      : state.challengeCompleted
        ? "等待迁移案例"
        : "正在记录游玩过程";
  return `
    <section class="panel research-status-panel">
      <div><span>匿名测试 ${escapeHtml(state.research.runId?.slice(-6) ?? "")}</span><strong>${stage}</strong></div>
      <div class="research-mini-metrics"><span>探索 <b>${metrics.explorationCount}</b></span><span>证据 <b>${metrics.evidenceStrength}</b></span><span>回溯 <b>${metrics.rewinds}</b></span></div>
      <button data-command="research">查看测试记录与下一步</button>
    </section>`;
}

function renderKnowledgePanel() {
  const unlocked = new Set(unlockedKnowledgeIds(state));
  return `
    <section class="panel knowledge-panel">
      <div class="section-heading compact">
        <div><div class="eyebrow">世界模型</div><h2>认知云图</h2></div>
        <strong>${unlocked.size}/${knowledgeNodes.length}</strong>
      </div>
      <div class="mini-cloud">
        ${knowledgeNodes.map((node) => `<button class="knowledge-node ${unlocked.has(node.id) ? "unlocked" : "locked"}" data-command="knowledge" title="${unlocked.has(node.id) ? escapeHtml(node.title) : "尚未从经历中辨认"}"><i></i><span>${node.group}</span></button>`).join("")}
      </div>
      <p>${state.lastChallengeLesson ? `最近一次主线留下的方法：${escapeHtml(state.lastChallengeLesson)}` : "支线经历会点亮事实节点；主线不会替你自动得出结论。"}</p>
      <button class="cloud-button" data-command="knowledge">打开云图与线索来源</button>
    </section>`;
}

function renderActions() {
  const categories = ["全部", "探索", "行动", "准备", "生活", "高风险"];
  const visible = actions.filter((action) => actionFilter === "全部" || action.category === actionFilter);
  return `
    <section class="actions-section panel">
      <div class="section-heading">
        <div><div class="eyebrow">把时间花在哪里</div><h2>向林澈提出建议</h2></div>
        <p>建议可能被接受、调整或拒绝。行动和探索使用同一个时间池。</p>
      </div>
      <div class="filters">
        ${categories.map((c) => `<button class="filter ${actionFilter === c ? "active" : ""}" data-filter="${c}">${c}</button>`).join("")}
      </div>
      <div class="action-grid">
        ${visible
          .map((action) => {
            const status = availability(state, action);
            return `
              <button class="action-card ${!status.allowed ? "locked" : ""} ${action.category === "高风险" ? "danger" : ""}" data-action="${action.id}" ${!status.allowed ? "disabled" : ""}>
                <span class="action-icon">${action.icon}</span>
                <span class="action-category">${action.category}</span>
                <strong>${action.title}</strong>
                <small>${action.description}</small>
                <span class="action-cost"><b>${action.days}天</b><b>¥${action.money}</b><b>${action.energy < 0 ? `精力 +${-action.energy}` : `精力 −${action.energy}`}</b></span>
                ${!status.allowed ? `<span class="lock-reason">${status.reason}</span>` : ""}
              </button>`;
          })
          .join("")}
      </div>
    </section>`;
}

function renderEvidence() {
  const evidence = state.evidence.map((id) => evidenceCatalog[id]).filter(Boolean);
  return `
    <aside class="panel evidence-panel">
      <div class="section-heading compact">
        <div><div class="eyebrow">认知档案</div><h2>证据板</h2></div>
        <strong>${evidence.length}</strong>
      </div>
      <div class="evidence-list">
        ${
          evidence.length
            ? evidence
                .slice()
                .reverse()
                .map(
                  (item) => `
                    <article class="evidence-card strength-${item.strength}">
                      <div><span>${"●".repeat(item.strength)}${"○".repeat(3 - item.strength)}</span><em>${item.source}</em></div>
                      <h3>${item.title}</h3>
                      <p>${item.detail}</p>
                      <small>局限：${item.caveat}</small>
                    </article>`,
                )
                .join("")
            : `<div class="empty-state"><span>?</span><p>你们还没有获得证据。<br/>从观察真实行为开始。</p></div>`
        }
      </div>
    </aside>`;
}

function renderProgress() {
  const b = state.business;
  const milestones = [
    ["问题证据", state.evidence.includes("pastLosses")],
    ["付款承诺", state.flags.depositTaken],
    ["付费交付", b.paidPilots > 0],
    ["流程成形", b.process >= 2],
    ["客户续费", b.repeatCustomers > 0],
  ];
  return `
    <section class="panel progress-panel">
      <div class="section-heading compact">
        <div><div class="eyebrow">双重成长</div><h2>进展</h2></div>
      </div>
      <div class="milestones">
        ${milestones.map(([label, done]) => `<div class="milestone ${done ? "done" : ""}"><i></i><span>${label}</span></div>`).join("")}
      </div>
      <div class="skill-list">
        ${meter("机会识别", state.skills.opportunity, 8, "blue")}
        ${meter("证据判断", state.skills.evidence, 10, "blue")}
        ${meter("风险控制", state.skills.risk, 8, "gold")}
        ${meter("复盘迭代", state.skills.iteration, 10, "gold")}
      </div>
      <button class="end-button" data-command="end">结束本轮并复盘</button>
      <p class="fine-print">你可以随时停止。及时退出也可能是成熟判断。</p>
    </section>`;
}

function renderMain() {
  return `
    ${renderHeader()}
    <div class="dashboard">
      ${renderProtagonist()}
      <div class="main-column">
        ${renderWorld()}
        ${renderActions()}
      </div>
      <div class="side-column">
        ${renderResearchStatus()}
        ${renderCastPanel()}
        ${renderKnowledgePanel()}
        ${renderEvidence()}
        ${renderProgress()}
      </div>
    </div>`;
}

function renderOpening() {
  return `
    <div class="modal-backdrop cinematic">
      <section class="opening-card">
        <div class="opening-number">42</div>
        <div class="opening-copy">
          <span class="chapter">CHAPTER 01 · 毕业以前</span>
          <h1>在答案之前</h1>
          ${openingLines.map((line) => `<p>${line}</p>`).join("")}
          <div class="role-note"><strong>你的角色</strong><span>像一位大模型顾问那样整理信息、提出建议，但没有强制权。</span></div>
          <button class="primary-button" data-command="start">进入第1天 <i>→</i></button>
          <button class="test-mode-button" data-command="test-start">作为匿名测试者开始</button>
          <small>教学原型，不构成现实投资或职业建议。<a href="./privacy.html">查看测试数据说明</a></small>
        </div>
      </section>
    </div>`;
}

function renderStoryModal() {
  const scene = currentStoryScene(state);
  if (!scene) return "";
  return `
    <div class="modal-backdrop story-backdrop">
      <section class="modal-card story-modal">
        <button class="modal-close" data-command="close">×</button>
        <div class="story-progress"><i class="done"></i><i class="${state.story.sceneIndex >= 1 ? "done" : ""}"></i><i></i><span>${scene.chapter}</span></div>
        <div class="eyebrow">${scene.location}</div>
        <h2>${scene.title}</h2>
        <p class="story-context">${scene.context}</p>
        <div class="scene-cast">
          ${scene.cast.map((id) => {
            const person = characters[id];
            return `<article><i>${person.mark}</i><div><strong>${person.name}</strong><span>${person.role}</span><small>当前立场：${person.interest}</small></div><b>关系 ${state.relationships?.[id] ?? 0}</b></article>`;
          }).join("")}
        </div>
        <div class="dialogue-strip">
          ${scene.dialogue.map((line) => `<blockquote><strong>${line.speaker}</strong><p>“${line.text}”</p></blockquote>`).join("")}
        </div>
        <div class="choice-label"><span>你建议林澈怎样继续？</span><small>选择的是获取认识或采取行动的方法，不是一句抽象立场。</small></div>
        <div class="story-choice-grid">
          ${scene.choices.map((choice) => `
            <label class="story-choice-card">
              <input type="radio" name="story-choice" value="${choice.id}" ${storyChoice === choice.id ? "checked" : ""}/>
              <span>${choice.days}天</span><strong>${choice.title}</strong><small>${choice.description}</small>
              <em>${choice.money >= 0 ? "+" : "−"}¥${Math.abs(choice.money)} · 精力 ${choice.energy >= 0 ? "+" : ""}${choice.energy}</em>
            </label>`).join("")}
        </div>
        ${challengeError ? `<p class="form-error">${escapeHtml(challengeError)}</p>` : ""}
        <div class="report-actions">
          <button class="ghost-button" data-command="close">先离开，去自由探索</button>
          <button class="primary-button" data-command="resolve-story">让选择进入现实 <i>→</i></button>
        </div>
      </section>
    </div>`;
}

function renderStoryResult() {
  const r = state.story?.lastResult;
  if (!r) return "";
  const nextScene = currentStoryScene(state);
  return `
    <div class="modal-backdrop story-result-backdrop">
      <section class="modal-card story-result-modal">
        <div class="scene-result-mark">${r.branch === "evidenceSupported" ? "成" : r.branch === "unsupportedAsk" ? "缺" : "见"}</div>
        <div class="eyebrow">${r.sceneChapter} · 经历 → 解释 → 后果</div>
        <h2>${r.title}</h2>
        <p class="branch-action">你的建议：${r.choiceTitle}</p>
        <div class="story-result-dialogue"><strong>${r.speaker}</strong><blockquote>“${r.quote}”</blockquote></div>
        <div class="report-flow">
          <article class="wide"><span>现实中发生了什么</span><p>${r.reality}</p></article>
          <article class="positive"><span>这条因果为什么成立</span><p>${r.cause}</p></article>
          <article class="unknown"><span>仍然不能确定</span><p>${r.unknown}</p></article>
        </div>
        <div class="branch-cost"><span>${r.days}天</span><span>${r.money >= 0 ? "+" : "−"}¥${Math.abs(r.money)}</span><span>主角信赖 ${r.trust >= 0 ? "+" : ""}${r.trust}</span></div>
        <div class="next-scene-hint"><span>下一幕</span><strong>${nextScene?.chapter ?? worldChallenge.chapter}</strong><p>${nextScene?.title ?? worldChallenge.title}</p></div>
        <div class="report-actions">
          <button class="ghost-button" data-command="knowledge">把经历放进认知云图</button>
          <button class="primary-button" data-command="accept-story-result">继续生活，不自动替你下结论 <i>→</i></button>
        </div>
      </section>
    </div>`;
}

function dimensionChips(assessment) {
  if (!assessment) return "";
  const found = new Set(assessment.dimensionIds);
  return transferDimensions
    .map(
      (dimension) =>
        `<span class="dimension-chip ${found.has(dimension.id) ? "found" : "missing"}" title="${dimension.description}">${found.has(dimension.id) ? "✓" : "·"} ${dimension.label}</span>`,
    )
    .join("");
}

function ratingOptions(selected) {
  return `<option value="">请选择</option>${[1, 2, 3, 4, 5]
    .map((value) => `<option value="${value}" ${String(selected) === String(value) ? "selected" : ""}>${value}</option>`)
    .join("")}`;
}

function renderResearchModal() {
  const research = state.research;
  const metrics = researchMetrics(state);

  if (!research?.mode) {
    return `
      <div class="modal-backdrop research-backdrop">
        <section class="modal-card research-modal">
          <button class="modal-close" data-command="close">×</button>
          <div class="eyebrow">匿名测试 · 约20—30分钟</div>
          <h2>先记录你还没玩游戏时的判断</h2>
          <div class="privacy-note"><strong>数据边界</strong><p>不收集姓名和联系方式。全部记录只保存在这个浏览器中；只有你点击导出后，才会生成本地JSON文件。</p></div>
          <div class="research-profile">
            <label>你目前更接近<select data-research-field="cohort"><option ${researchDraft.cohort === "大学生" ? "selected" : ""}>大学生</option><option ${researchDraft.cohort === "在职员工" ? "selected" : ""}>在职员工</option><option ${researchDraft.cohort === "离职或待业" ? "selected" : ""}>离职或待业</option><option ${researchDraft.cohort === "其他" ? "selected" : ""}>其他</option></select></label>
            <label>相关经历<select data-research-field="experience"><option ${researchDraft.experience === "没有实际创业经历" ? "selected" : ""}>没有实际创业经历</option><option ${researchDraft.experience === "做过副业或小项目" ? "selected" : ""}>做过副业或小项目</option><option ${researchDraft.experience === "有全职创业经历" ? "selected" : ""}>有全职创业经历</option></select></label>
          </div>
          <article class="transfer-case"><span>${transferScenarios.baseline.title}</span><p>${transferScenarios.baseline.situation}</p></article>
          <label class="research-text-label">${transferScenarios.baseline.prompt}<textarea data-research-field="baseline" placeholder="没有标准句式，请写下你此刻真实会怎么判断。">${escapeHtml(researchDraft.baseline)}</textarea></label>
          ${researchError ? `<p class="form-error">${escapeHtml(researchError)}</p>` : ""}
          <div class="report-actions"><button class="ghost-button" data-command="close">暂不参加</button><button class="primary-button" data-command="save-baseline">保存基线并进入游戏 <i>→</i></button></div>
        </section>
      </div>`;
  }

  if (research.feedback) {
    return `
      <div class="modal-backdrop research-backdrop">
        <section class="modal-card research-modal completed-research">
          <button class="modal-close" data-command="close">×</button>
          <div class="eyebrow">匿名测试已完成</div>
          <h2>这是一份测试记录，不是人生能力分数</h2>
          <div class="comparison-grid"><article><span>游玩前主动纳入</span><strong>${research.baseline.score}/${research.baseline.total}</strong><div>${dimensionChips(research.baseline)}</div></article><article><span>陌生案例中主动纳入</span><strong>${research.post.score}/${research.post.total}</strong><div>${dimensionChips(research.post)}</div></article></div>
          <div class="metrics-grid"><span>探索行动<b>${metrics.explorationCount}</b></span><span>证据强度<b>${metrics.evidenceStrength}</b></span><span>剧情场景<b>${metrics.storyScenes}</b></span><span>认知回溯<b>${metrics.rewinds}</b></span></div>
          <div class="privacy-note"><strong>如何交给开发者</strong><p>点击导出只会在本机生成记录文件。你可以自己查看，再决定是否发送。</p></div>
          <div class="report-actions"><button class="primary-button" data-command="export">导出匿名测试记录 <i>↓</i></button></div>
        </section>
      </div>`;
  }

  if (research.post) {
    return `
      <div class="modal-backdrop research-backdrop">
        <section class="modal-card research-modal">
          <button class="modal-close" data-command="close">×</button>
          <div class="eyebrow">最后一步 · 体验反馈</div>
          <h2>这套机制是否真的让你参与了判断？</h2>
          <div class="comparison-grid"><article><span>游玩前主动纳入</span><strong>${research.baseline.score}/${research.baseline.total}</strong><div>${dimensionChips(research.baseline)}</div></article><article><span>陌生案例中主动纳入</span><strong>${research.post.score}/${research.post.total}</strong><div>${dimensionChips(research.post)}</div></article></div>
          <div class="rating-grid">
            <label>我感觉自己的理解改变了故事<select data-research-field="agency">${ratingOptions(researchDraft.agency)}</select></label>
            <label>我能理解结果为什么发生<select data-research-field="clarity">${ratingOptions(researchDraft.clarity)}</select></label>
            <label>我愿意继续体验下一案例<select data-research-field="engagement">${ratingOptions(researchDraft.engagement)}</select></label>
          </div>
          <label class="research-text-label compact">哪一刻最有用？<textarea data-research-field="useful">${escapeHtml(researchDraft.useful)}</textarea></label>
          <label class="research-text-label compact">哪一处最困惑、无聊或像考试？<textarea data-research-field="confusing">${escapeHtml(researchDraft.confusing)}</textarea></label>
          ${researchError ? `<p class="form-error">${escapeHtml(researchError)}</p>` : ""}
          <div class="report-actions"><button class="primary-button" data-command="save-feedback">完成测试记录 <i>→</i></button></div>
        </section>
      </div>`;
  }

  if (state.challengeCompleted) {
    return `
      <div class="modal-backdrop research-backdrop">
        <section class="modal-card research-modal">
          <button class="modal-close" data-command="close">×</button>
          <div class="eyebrow">迁移测试 · 新人物、新行业</div>
          <h2>刚才的方法能否用到陌生案例？</h2>
          <p class="modal-intro">这一步不判断你有没有选择创业，只观察你会不会主动识别缺失认识、验证方法和风险边界。</p>
          <article class="transfer-case"><span>${transferScenarios.post.title}</span><p>${transferScenarios.post.situation}</p></article>
          <label class="research-text-label">${transferScenarios.post.prompt}<textarea data-research-field="post" placeholder="请写得具体到可以执行的下一步。">${escapeHtml(researchDraft.post)}</textarea></label>
          ${researchError ? `<p class="form-error">${escapeHtml(researchError)}</p>` : ""}
          <div class="report-actions"><button class="primary-button" data-command="save-post">分析我主动纳入的因果维度 <i>→</i></button></div>
        </section>
      </div>`;
  }

  return `
    <div class="modal-backdrop research-backdrop">
      <section class="modal-card research-modal progress-research">
        <button class="modal-close" data-command="close">×</button>
        <div class="eyebrow">匿名测试正在进行 · ${escapeHtml(research.runId)}</div>
        <h2>系统正在记录选择，不会提示最优路线</h2>
        <div class="metrics-grid"><span>探索行动<b>${metrics.explorationCount}</b></span><span>证据强度<b>${metrics.evidenceStrength}</b></span><span>剧情场景<b>${metrics.storyScenes}/2</b></span><span>认知回溯<b>${metrics.rewinds}</b></span></div>
        <div class="baseline-lock"><span>基线回答已锁定</span><p>${escapeHtml(research.baseline.text)}</p><div>${dimensionChips(research.baseline)}</div></div>
        <p class="modal-intro">完成第三幕并接受一条人生线后，迁移案例会自动出现。</p>
        <div class="report-actions"><button class="primary-button" data-command="close">继续游戏 <i>→</i></button></div>
      </section>
    </div>`;
}

function renderHypothesisModal() {
  return `
    <div class="modal-backdrop">
      <section class="modal-card hypothesis-modal">
        <button class="modal-close" data-command="close">×</button>
        <div class="eyebrow">不是选择永久路线</div>
        <h2>形成当前工作假设</h2>
        <p class="modal-intro">选择你现在最值得验证的判断。假设会影响你如何解释证据，但不会锁死后续行动。</p>
        <div class="hypothesis-grid">
          ${hypotheses
            .map((h) => {
              const support = hypothesisEvidence(state, h.id);
              return `
                <article class="hypothesis-card ${state.activeHypothesis === h.id ? "selected" : ""}">
                  <div class="hypothesis-top"><span>${support.count}条相关证据 · 强度${support.strength}</span>${state.activeHypothesis === h.id ? "<b>当前</b>" : ""}</div>
                  <h3>${h.title}</h3>
                  <p>${h.statement}</p>
                  <details><summary>预测与止损</summary><small><b>预测：</b>${h.prediction}</small><small><b>止损：</b>${h.stop}</small></details>
                  <label>我现在的置信度 <output id="out-${h.id}">${state.activeHypothesis === h.id ? state.confidence : 45}%</output></label>
                  <input type="range" min="10" max="90" step="5" value="${state.activeHypothesis === h.id ? state.confidence : 45}" data-confidence="${h.id}" />
                  <button data-select-hypothesis="${h.id}">采用为工作假设</button>
                </article>`;
            })
            .join("")}
        </div>
        <button class="continue-button" data-command="close">暂不形成，继续探索</button>
      </section>
    </div>`;
}

const conceptLabels = {
  demand: "真实需求",
  economics: "交易与成本",
  substitutes: "替代品变化",
  responsibility: "责任边界",
  distribution: "客户入口",
  runway: "生存与退路",
};

function renderKnowledgeModal() {
  const unlocked = new Set(unlockedKnowledgeIds(state));
  return `
    <div class="modal-backdrop">
      <section class="modal-card knowledge-modal">
        <button class="modal-close" data-command="close">×</button>
        <div class="eyebrow">经历不是收藏品，而是世界模型的来源</div>
        <h2>认知云图</h2>
        <p class="modal-intro">节点记录你们目前有现实依据的认识。灰色区域只告诉你“还有什么问题”，不会提前给出答案。</p>
        <div class="cloud-map">
          ${knowledgeNodes.map((node, index) => {
            const isUnlocked = unlocked.has(node.id);
            return `
              <article class="cloud-node ${isUnlocked ? "unlocked" : "locked"}" style="--node-index:${index}">
                <div><span>${node.group}</span><i>${isUnlocked ? "已辨认" : "未知"}</i></div>
                <h3>${isUnlocked ? node.title : "尚未辨认的社会规律"}</h3>
                <p>${isUnlocked ? node.summary : `从与“${node.group}”有关的真实经历中寻找线索。`}</p>
                <small>${isUnlocked ? `来源：${node.unlockEvidence?.filter((id) => state.evidence.includes(id)).map((id) => evidenceCatalog[id]?.title).filter(Boolean).join("、") || "一次关键行动"}` : "没有证据时，猜测仍可提出，但可靠度更低。"}</small>
              </article>`;
          }).join("")}
        </div>
        <div class="cloud-legend"><span><i class="known"></i>经历支持的认识</span><span><i></i>仍待探索的盲区</span><b>回溯 ${state.rewinds ?? 0} 次</b></div>
      </section>
    </div>`;
}

function renderChallengeModal() {
  const unlocked = new Set(unlockedKnowledgeIds(state));
  const knownNodes = knowledgeNodes.filter((node) => unlocked.has(node.id));
  return `
    <div class="modal-backdrop challenge-backdrop">
      <section class="modal-card challenge-modal">
        <button class="modal-close" data-command="close">×</button>
        <div class="eyebrow">${worldChallenge.chapter}</div>
        <h2>${worldChallenge.title}</h2>
        <p class="challenge-situation">${worldChallenge.situation}</p>
        <div class="challenge-layout">
          <div class="understanding-entry">
            <label for="understanding"><span>01 · 写下当前理解</span><small>系统会按意思接近程度匹配预设的因果节点；不是找一句标准台词。</small></label>
            <textarea id="understanding" data-understanding placeholder="${worldChallenge.prompt}">${escapeHtml(challengeDraft)}</textarea>
            <div class="known-context">
              <strong>你有依据的认识</strong>
              ${knownNodes.length ? knownNodes.map((node) => `<span>${node.group} · ${node.title}</span>`).join("") : "<em>尚无已辨认节点</em>"}
            </div>
          </div>
          <div class="direction-entry">
            <div class="choice-label"><span>02 · 建议行动方向</span><small>同一行动会因理解深度产生不同执行与演出。</small></div>
            <div class="direction-grid">
              ${worldChallenge.actions.map((action) => `
                <label class="direction-card">
                  <input type="radio" name="challenge-direction" value="${action.id}" ${challengeDirection === action.id ? "checked" : ""} />
                  <i>${action.icon}</i><strong>${action.title}</strong><small>${action.description}</small>
                </label>`).join("")}
            </div>
          </div>
        </div>
        ${challengeError ? `<p class="form-error">${escapeHtml(challengeError)}</p>` : ""}
        <div class="report-actions">
          <button class="ghost-button" data-command="knowledge">返回查看认知云图</button>
          <button class="primary-button" data-command="resolve-challenge">让理解进入现实 <i>→</i></button>
        </div>
      </section>
    </div>`;
}

function renderChallengeResult() {
  const r = state.challengeResult;
  const known = r.verifiedConcepts.map((id) => conceptLabels[id] ?? id);
  const inferred = r.inferredConcepts.map((id) => conceptLabels[id] ?? id);
  const missing = r.missingConcepts.map((id) => conceptLabels[id] ?? id);
  return `
    <div class="modal-backdrop result-backdrop ${r.tone}">
      <section class="modal-card challenge-result-modal">
        <div class="branch-stamp">${r.band === "strong" ? "破局" : r.band === "partial" ? "偏航" : "困局"}</div>
        <div class="eyebrow">认识 × 行动 · 分支结果</div>
        <h2>${r.title}</h2>
        <p class="branch-action">你建议：${r.actionTitle}</p>
        <blockquote>“${escapeHtml(r.understandingText)}”</blockquote>
        <div class="causal-grid">
          <article class="outcome"><span>世界作出的反馈</span><p>${r.result}</p></article>
          <article><span>为什么发生</span><p>${r.cause}</p></article>
          <article><span>经历支持的认识</span><p>${known.length ? known.join("、") : "你的判断尚未得到任何已探索事实的支撑。"}</p></article>
          <article><span>推测 / 尚缺</span><p>${[inferred.length ? `有推测：${inferred.join("、")}` : "", missing.length ? `未纳入：${missing.join("、")}` : "关键因素已被纳入"].filter(Boolean).join("；")}</p></article>
        </div>
        <div class="ending-lesson"><span>可以迁移到下一场景的方法</span><p>${r.lesson}</p></div>
        <div class="branch-cost"><span>${r.days}天</span><span>${r.money >= 0 ? "+" : "−"}¥${Math.abs(r.money)}</span><span>信赖 ${r.trust >= 0 ? "+" : ""}${r.trust}</span></div>
        <div class="report-actions">
          ${r.band !== "strong" ? `<button class="ghost-button" data-command="rewind-challenge">认知回溯：带着原因重来</button>` : ""}
          <button class="primary-button" data-command="accept-challenge">接受这条人生线 <i>→</i></button>
        </div>
      </section>
    </div>`;
}

function renderReport() {
  const r = state.lastReport;
  return `
    <div class="modal-backdrop">
      <section class="modal-card report-modal ${r.refused ? "refusal" : ""}">
        <button class="modal-close" data-command="close-report">×</button>
        <div class="report-mark">${r.refused ? "拒" : "验"}</div>
        <div class="eyebrow">经历 → 假设 → 验证</div>
        <h2>${r.title}</h2>
        <div class="report-flow">
          <article><span>经历</span><p>${r.experience}</p></article>
          <article><span>这次验证</span><p>${r.validation}</p></article>
          <article class="wide"><span>现实结果</span><p>${r.result}</p></article>
          <article class="positive"><span>得到支持</span><p>${r.confirmed}</p></article>
          <article class="unknown"><span>仍然未知</span><p>${r.unknown}</p></article>
        </div>
        <blockquote>“${r.quote}”</blockquote>
        ${r.trustDelta ? `<div class="trust-change ${r.trustDelta < 0 ? "loss" : "gain"}">信赖 ${r.trustDelta > 0 ? "+" : ""}${r.trustDelta}</div>` : ""}
        <div class="report-actions">
          <button class="ghost-button" data-command="hypothesis-from-report">检查或修正假设</button>
          <button class="primary-button" data-command="close-report">接受反馈，继续 <i>→</i></button>
        </div>
      </section>
    </div>`;
}

function renderEnding() {
  const summary = endingSummary(state);
  return `
    <div class="modal-backdrop ending-backdrop">
      <section class="modal-card ending-card">
        <div class="eyebrow">第 ${Math.min(state.day, state.maxDay)} 天 · 阶段复盘</div>
        <h2>不是成功判定，<br/>而是你们现在站在哪里。</h2>
        <div class="ending-grid">
          <article><span>事业状态</span><strong>${summary.businessStage}</strong><p>收入 ¥${state.business.revenue} · 可归集成本 ¥${state.business.costs} · 净额 ¥${summary.margin}</p></article>
          <article><span>创业认知</span><strong>${summary.capability}</strong><p>共获得 ${summary.evidence} 条证据，形成 ${state.history.filter((h) => h.type === "hypothesis").length} 次假设记录。</p></article>
          <article><span>协作关系</span><strong>${summary.trustText}</strong><p>最终信赖度 ${state.trust}/100。</p></article>
        </div>
        <div class="ending-lesson"><span>下一步理解</span><p>${summary.lesson}</p></div>
        <div class="report-actions">
          <button class="ghost-button" data-command="export">导出本局记录</button>
          <button class="primary-button" data-command="reset">用不同方法再来一次 <i>↺</i></button>
        </div>
      </section>
    </div>`;
}

function render() {
  app.innerHTML = renderMain();
  if (modal === "opening") app.insertAdjacentHTML("beforeend", renderOpening());
  if (modal === "story") app.insertAdjacentHTML("beforeend", renderStoryModal());
  if (modal === "story-result") app.insertAdjacentHTML("beforeend", renderStoryResult());
  if (modal === "research") app.insertAdjacentHTML("beforeend", renderResearchModal());
  if (modal === "hypothesis") app.insertAdjacentHTML("beforeend", renderHypothesisModal());
  if (modal === "knowledge") app.insertAdjacentHTML("beforeend", renderKnowledgeModal());
  if (modal === "challenge") app.insertAdjacentHTML("beforeend", renderChallengeModal());
  if (modal === "challenge-result" && state.challengeResult) app.insertAdjacentHTML("beforeend", renderChallengeResult());
  if (state.lastReport && modal === "report") app.insertAdjacentHTML("beforeend", renderReport());
  if (state.ended) app.insertAdjacentHTML("beforeend", renderEnding());
}

function download(filename, content) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

app.addEventListener("input", (event) => {
  if (event.target.matches("[data-understanding]")) {
    challengeDraft = event.target.value;
    return;
  }
  if (event.target.matches('input[name="challenge-direction"]')) {
    challengeDirection = event.target.value;
    return;
  }
  if (event.target.matches('input[name="story-choice"]')) {
    storyChoice = event.target.value;
    return;
  }
  const researchField = event.target.closest("[data-research-field]")?.dataset.researchField;
  if (researchField) {
    researchDraft[researchField] = event.target.value;
    return;
  }
  const input = event.target.closest("[data-confidence]");
  if (!input) return;
  const output = document.querySelector(`#out-${input.dataset.confidence}`);
  if (output) output.textContent = `${input.value}%`;
});

app.addEventListener("click", (event) => {
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    actionFilter = filter.dataset.filter;
    render();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const result = applyAction(state, actionButton.dataset.action);
    if (result.error) return;
    state = result.state;
    modal = "report";
    saveState();
    render();
    return;
  }

  const hypothesisButton = event.target.closest("[data-select-hypothesis]");
  if (hypothesisButton) {
    const id = hypothesisButton.dataset.selectHypothesis;
    const confidence = document.querySelector(`[data-confidence="${id}"]`)?.value ?? 45;
    state = setHypothesis(state, id, confidence);
    modal = null;
    saveState();
    render();
    return;
  }

  const command = event.target.closest("[data-command]")?.dataset.command;
  if (!command) return;

  if (command === "start") {
    state.started = true;
    modal = null;
    saveState();
  }
  if (command === "test-start") {
    state.started = true;
    researchError = "";
    modal = "research";
    saveState();
  }
  if (command === "research") {
    researchError = "";
    modal = "research";
  }
  if (command === "save-baseline") {
    const runId = `T-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
    const result = startResearchSession(state, {
      runId,
      cohort: researchDraft.cohort,
      experience: researchDraft.experience,
      baselineText: researchDraft.baseline,
      startedAt: new Date().toISOString(),
    });
    if (result.error) {
      researchError = result.error;
      modal = "research";
    } else {
      state = result.state;
      researchError = "";
      modal = null;
      saveState();
    }
  }
  if (command === "save-post") {
    const result = recordPostTransfer(state, researchDraft.post);
    if (result.error) {
      researchError = result.error;
    } else {
      state = result.state;
      researchError = "";
      saveState();
    }
    modal = "research";
  }
  if (command === "save-feedback") {
    const result = recordResearchFeedback(state, {
      agency: researchDraft.agency,
      clarity: researchDraft.clarity,
      engagement: researchDraft.engagement,
      useful: researchDraft.useful,
      confusing: researchDraft.confusing,
      completedAt: new Date().toISOString(),
    });
    if (result.error) {
      researchError = result.error;
    } else {
      state = result.state;
      researchError = "";
      saveState();
    }
    modal = "research";
  }
  if (command === "knowledge") {
    modal = "knowledge";
  }
  if (command === "story") {
    challengeError = "";
    storyChoice = "";
    modal = "story";
  }
  if (command === "resolve-story") {
    const result = resolveStoryChoice(state, storyChoice);
    if (result.error) {
      challengeError = result.error;
      modal = "story";
    } else {
      state = result.state;
      storyChoice = "";
      challengeError = "";
      modal = "story-result";
      saveState();
    }
  }
  if (command === "accept-story-result") {
    modal = null;
    saveState();
  }
  if (command === "challenge") {
    challengeError = "";
    modal = "challenge";
  }
  if (command === "challenge-result") {
    modal = "challenge-result";
  }
  if (command === "resolve-challenge") {
    const result = resolveWorldChallenge(state, challengeDraft, challengeDirection);
    if (result.error) {
      challengeError = result.error;
      modal = "challenge";
    } else {
      state = result.state;
      challengeError = "";
      storyChoice = "";
      modal = "challenge-result";
      saveState();
    }
  }
  if (command === "rewind-challenge") {
    const result = rewindWorldChallenge(state);
    if (!result.error) {
      state = result.state;
      challengeDraft = "";
      challengeDirection = "";
      storyChoice = "";
      challengeError = "";
      modal = "challenge";
      saveState();
    }
  }
  if (command === "accept-challenge") {
    modal = state.research?.mode && !state.research.post ? "research" : null;
    if (state.day > state.maxDay && !state.research?.mode) state = endGame(state);
    saveState();
  }
  if (command === "hypothesis" || command === "hypothesis-from-report") {
    state.lastReport = null;
    modal = "hypothesis";
    saveState();
  }
  if (command === "close") modal = null;
  if (command === "close-report") {
    state.lastReport = null;
    modal = null;
    saveState();
  }
  if (command === "end") {
    state = endGame(state);
    modal = null;
    saveState();
  }
  if (command === "export") {
    const suffix = state.research?.mode ? `匿名测试-${state.research.runId}` : `第${Math.min(state.day, state.maxDay)}天`;
    download(`在答案之前-${suffix}.json`, exportRun(state));
  }
  if (command === "reset") {
    if (window.confirm("确定重新开始？当前进度会被清除。")) {
      state = createInitialState();
      modal = "opening";
      challengeDraft = "";
      challengeDirection = "";
      challengeError = "";
      researchError = "";
      researchDraft = {
        cohort: "大学生", experience: "没有实际创业经历", baseline: "", post: "",
        agency: "", clarity: "", engagement: "", useful: "", confusing: "",
      };
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  render();
});

render();
