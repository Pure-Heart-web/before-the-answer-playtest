import {
  actions,
  challengeOutcomes,
  characters,
  evidenceCatalog,
  hypotheses,
  knowledgeNodes,
  shopExplorationSpots,
  storyScenes,
  transferDimensions,
  worldChallenge,
} from "./content.js";

export const INITIAL_STATE = {
  started: false,
  day: 1,
  maxDay: 42,
  money: 6800,
  energy: 76,
  trust: 72,
  activeHypothesis: null,
  confidence: 45,
  evidence: [],
  completed: [],
  flags: {},
  business: {
    revenue: 0,
    costs: 0,
    paidPilots: 0,
    repeatCustomers: 0,
    process: 0,
    reliability: 0,
  },
  skills: {
    opportunity: 0,
    evidence: 0,
    risk: 0,
    iteration: 0,
  },
  history: [],
  lastReport: null,
  worldEvents: [],
  story: {
    sceneIndex: 0,
    completed: [],
    lastResult: null,
  },
  shopExploration: {
    visited: [],
    completed: false,
  },
  relationships: {
    tangMan: 42,
    xuLan: 58,
    chengYu: 64,
    guYao: 0,
  },
  research: {
    mode: false,
    runId: null,
    profile: null,
    baseline: null,
    post: null,
    feedback: null,
    startedAt: null,
    completedAt: null,
  },
  challengeCompleted: false,
  challengeResult: null,
  challengeSnapshot: null,
  rewinds: 0,
  lastChallengeLesson: null,
  ended: false,
};

export function createInitialState() {
  return structuredClone(INITIAL_STATE);
}

export function evidenceScore(state) {
  return state.evidence.reduce(
    (sum, id) => sum + (evidenceCatalog[id]?.strength ?? 0),
    0,
  );
}

export function unlockedKnowledgeIds(state) {
  return knowledgeNodes
    .filter((node) => {
      const evidenceUnlock = node.unlockEvidence?.some((id) => state.evidence.includes(id));
      const flagUnlock = node.unlockFlag && state.flags[node.unlockFlag];
      return evidenceUnlock || flagUnlock;
    })
    .map((node) => node.id);
}

export function challengeAvailability(state) {
  if (state.ended) return { allowed: false, reason: "本轮已经结束" };
  if (state.challengeCompleted) return { allowed: false, reason: "本轮挑战已经完成" };
  if (state.evidence.length === 0) {
    return { allowed: false, reason: "至少经历一次现实探索后，外部挑战才会出现" };
  }
  return { allowed: true, reason: "局势已经变化，可以带着当前认识进入" };
}

export function currentStoryScene(state) {
  return storyScenes[state.story?.sceneIndex ?? 0] ?? null;
}

export function storySceneAvailability(state) {
  const scene = currentStoryScene(state);
  if (state.ended) return { allowed: false, reason: "本轮已经结束" };
  if (!scene) return { allowed: false, reason: "前两幕已经完成" };
  return { allowed: true, reason: `进入${scene.chapter}` };
}

function clampRelationship(value) {
  return Math.max(0, Math.min(100, value));
}

export function inspectShopSpot(state, spotId) {
  const spot = shopExplorationSpots.find((item) => item.id === spotId);
  if (!spot) return { state, error: "这个调查点不存在" };
  if ((state.story?.sceneIndex ?? 0) !== 0) {
    return { state, error: "第一幕已经结束，店内现场不再开放" };
  }
  const visited = state.shopExploration?.visited ?? [];
  if (visited.includes(spotId)) return { state, error: "这个位置已经调查过" };
  if (spot.requiresClue && visited.length === 0) {
    return { state, error: "先找到一个具体痕迹，再用它请求店主停下来交谈" };
  }
  if (state.day + spot.days > state.maxDay + 1) {
    return { state, error: "剩余时间不足以完成这次调查" };
  }

  const next = structuredClone(state);
  next.shopExploration ??= { visited: [], completed: false };
  next.relationships ??= Object.fromEntries(Object.keys(characters).map((id) => [id, 0]));
  next.day += spot.days;
  next.money = Math.max(0, next.money + spot.money);
  next.energy = Math.max(0, Math.min(100, next.energy + spot.energy));
  next.relationships.tangMan = clampRelationship(
    (next.relationships.tangMan ?? 0) + (spot.relationship ?? 0),
  );
  next.shopExploration.visited.push(spot.id);
  addEvidence(next, [spot.evidence]);
  mergeNumbers(next.skills, { opportunity: 1, evidence: 1 });
  next.history.push({
    day: state.day,
    type: "shopInspect",
    spotId: spot.id,
    days: spot.days,
    evidence: spot.evidence,
  });
  triggerWorldEvents(next);
  return { state: next, error: null, finding: spot };
}

export function finishShopExploration(state) {
  const visited = state.shopExploration?.visited ?? [];
  if (visited.length === 0) return { state, error: "至少带走一条线索，再进入谈话" };
  const next = structuredClone(state);
  next.shopExploration ??= { visited: [], completed: false };
  next.shopExploration.completed = true;
  next.history.push({
    day: next.day,
    type: "shopExplorationExit",
    visited: [...visited],
  });
  return { state: next, error: null };
}

export function resolveStoryChoice(state, choiceId) {
  const scene = currentStoryScene(state);
  if (!scene) return { state, error: "当前没有可推进的剧情场景" };
  const choice = scene.choices.find((item) => item.id === choiceId);
  if (!choice) return { state, error: "请选择一个处理方式" };

  const next = structuredClone(state);
  next.story ??= { sceneIndex: 0, completed: [], lastResult: null };
  next.relationships ??= Object.fromEntries(Object.keys(characters).map((id) => [id, 0]));
  const visitedShopSpots = next.shopExploration?.visited ?? [];
  const followedShopClue =
    scene.id === "complimentAndLedger" &&
    choice.id === "inspectPastLoss" &&
    visitedShopSpots.some((id) => ["ledger", "messages"].includes(id));
  const ignoredOwnerConstraint =
    scene.id === "complimentAndLedger" &&
    ["askPreference", "demoImmediately"].includes(choice.id) &&
    visitedShopSpots.includes("owner");
  const actualDays = followedShopClue ? Math.max(1, choice.days - 1) : choice.days;
  next.day += actualDays;
  next.money = Math.max(0, next.money + choice.money);
  next.energy = Math.max(0, Math.min(100, next.energy + choice.energy));
  next.trust = Math.max(0, Math.min(100, next.trust + choice.trust));
  Object.entries(choice.relationships ?? {}).forEach(([id, delta]) => {
    next.relationships[id] = clampRelationship((next.relationships[id] ?? 0) + delta);
  });
  if (followedShopClue) {
    next.trust = Math.min(100, next.trust + 1);
    next.relationships.tangMan = clampRelationship(next.relationships.tangMan + 2);
  }
  if (ignoredOwnerConstraint) {
    next.trust = Math.max(0, next.trust - 2);
    next.relationships.tangMan = clampRelationship(next.relationships.tangMan - 2);
  }
  addEvidence(next, choice.evidence);
  Object.assign(next.flags, choice.flags ?? {});
  mergeNumbers(next.business, choice.business);
  mergeNumbers(next.skills, choice.skill);

  let result = choice.result;
  let extraMoney = 0;
  let branch = "authored";
  if (followedShopClue) {
    branch = "clueFollowed";
    result = {
      ...result,
      title: "你沿着现场的断点追到了损失",
      reality: "你从账本或未读消息中的具体空白问起，唐曼很快找出了完整记录；问题真实发生，但她还没有承诺购买。",
      cause: "先观察再提问，让有限的谈话时间集中在一次已经发生的损失，而不是泛泛讨论AI。",
    };
  } else if (ignoredOwnerConstraint) {
    branch = "ignoredSignal";
    result = {
      ...result,
      cause: `${result.cause} 你还忽略了唐曼刚刚明确说出的时间与责任约束。`,
    };
  }
  if (choice.conditional === "storyDeposit") {
    next.flags.proposalReady = true;
    next.flags.privacyReady = true;
    if (next.evidence.includes("pastLosses") || next.evidence.includes("observedDelay")) {
      addEvidence(next, ["deposit"]);
      next.flags.depositTaken = true;
      next.business.revenue += 300;
      next.money += 300;
      extraMoney = 300;
      branch = "evidenceSupported";
      result = {
        title: "边界让第一笔钱成为可能",
        speaker: "唐曼",
        quote: "范围写清楚、关键回复我确认。三百元我可以先试一周。",
        reality: "唐曼支付定金。她购买的不是AI功能，而是一个有人负责的小范围结果。",
        cause: "此前的损失证据、明确价格和责任边界共同降低了交易风险。",
        unknown: "续费、真实人工成本和陌生获客仍未得到证明。",
      };
    } else {
      next.trust = Math.max(0, next.trust - 3);
      next.relationships.tangMan = clampRelationship(next.relationships.tangMan - 4);
      branch = "unsupportedAsk";
      result = {
        title: "报价清楚，购买理由仍然模糊",
        speaker: "唐曼",
        quote: "三百元不算多，但你还没让我看到它具体替我避免了什么。",
        reality: "唐曼认可边界，却没有支付定金。形式完整不能替代问题证据。",
        cause: "你设计了低风险交易，却跳过了客户过去损失的确认。",
        unknown: "先还原一次真实漏单，可能会改变她对价格的判断。",
      };
    }
  }

  next.story.completed.push(scene.id);
  next.story.sceneIndex += 1;
  next.story.lastResult = {
    sceneId: scene.id,
    sceneChapter: scene.chapter,
    choiceId: choice.id,
    choiceTitle: choice.title,
    days: actualDays,
    money: choice.money + extraMoney,
    trust: choice.trust,
    branch,
    shopClues: [...visitedShopSpots],
    ...result,
  };
  next.history.push({
    day: state.day,
    type: "storyScene",
    sceneId: scene.id,
    choiceId: choice.id,
    branch,
    shopClues: [...visitedShopSpots],
  });
  return { state: next, error: null };
}

function normalizeUnderstanding(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[\s，。！？、；：,.!?;:（）()“”\"']/g, "");
}

export function evaluateUnderstanding(text) {
  const normalized = normalizeUnderstanding(text);
  const matches = knowledgeNodes
    .map((node) => {
      const keywords = node.keywords.filter((keyword) =>
        normalized.includes(normalizeUnderstanding(keyword)),
      );
      return keywords.length
        ? { nodeId: node.id, concept: node.concept, title: node.title, keywords }
        : null;
    })
    .filter(Boolean);

  return {
    text: String(text ?? "").trim(),
    matches,
    concepts: [...new Set(matches.map((match) => match.concept))],
  };
}

export function evaluateTransferResponse(text) {
  const normalized = normalizeUnderstanding(text);
  const dimensions = transferDimensions
    .map((dimension) => {
      const keywords = dimension.keywords.filter((keyword) =>
        normalized.includes(normalizeUnderstanding(keyword)),
      );
      return keywords.length
        ? { id: dimension.id, label: dimension.label, keywords }
        : null;
    })
    .filter(Boolean);
  return {
    text: String(text ?? "").trim(),
    dimensions,
    dimensionIds: dimensions.map((item) => item.id),
    score: dimensions.length,
    total: transferDimensions.length,
  };
}

export function startResearchSession(state, details) {
  if (String(details.baselineText ?? "").trim().length < 24) {
    return { state, error: "请先用几句话写下你的初始判断（至少24个字符）" };
  }
  const next = structuredClone(state);
  next.research = {
    mode: true,
    runId: details.runId,
    profile: {
      cohort: details.cohort || "未填写",
      experience: details.experience || "未填写",
    },
    baseline: evaluateTransferResponse(details.baselineText),
    post: null,
    feedback: null,
    startedAt: details.startedAt ?? null,
    completedAt: null,
  };
  next.history.push({ day: next.day, type: "researchBaseline" });
  return { state: next, error: null };
}

export function recordPostTransfer(state, text) {
  if (!state.research?.mode) return { state, error: "当前不是用户测试模式" };
  if (String(text ?? "").trim().length < 40) {
    return { state, error: "请完整写下认识、行动与止损条件（至少40个字符）" };
  }
  const next = structuredClone(state);
  next.research.post = evaluateTransferResponse(text);
  next.history.push({ day: next.day, type: "researchPost" });
  return { state: next, error: null };
}

export function recordResearchFeedback(state, feedback) {
  if (!state.research?.post) return { state, error: "请先完成迁移案例" };
  const ratings = [feedback.agency, feedback.clarity, feedback.engagement].map(Number);
  if (ratings.some((rating) => rating < 1 || rating > 5 || !Number.isFinite(rating))) {
    return { state, error: "请完成三项1—5分体验评价" };
  }
  if (String(feedback.confusing ?? "").trim().length < 4) {
    return { state, error: "请写下一处最困惑或最想修改的地方" };
  }
  const next = structuredClone(state);
  next.research.feedback = {
    agency: ratings[0],
    clarity: ratings[1],
    engagement: ratings[2],
    useful: String(feedback.useful ?? "").trim(),
    confusing: String(feedback.confusing ?? "").trim(),
  };
  next.research.completedAt = feedback.completedAt ?? null;
  next.history.push({ day: next.day, type: "researchFeedback" });
  return { state: next, error: null };
}

export function researchMetrics(state) {
  const actionHistory = state.history.filter((item) => item.actionId);
  const actionLookup = new Map(actions.map((action) => [action.id, action]));
  const explorationCount = actionHistory.filter(
    (item) => actionLookup.get(item.actionId)?.category === "探索",
  ).length + state.history.filter((item) => item.type === "shopInspect").length;
  const committedCount = actionHistory.filter((item) => {
    const action = actionLookup.get(item.actionId);
    return action?.category === "行动" || action?.category === "高风险";
  }).length;
  return {
    day: state.day,
    evidenceCount: state.evidence.length,
    evidenceStrength: evidenceScore(state),
    explorationCount,
    committedCount,
    hypothesisCount: state.history.filter((item) => item.type === "hypothesis").length,
    storyScenes: state.story?.completed?.length ?? 0,
    rewinds: state.rewinds ?? 0,
    trust: state.trust,
    baselineScore: state.research?.baseline?.score ?? null,
    postScore: state.research?.post?.score ?? null,
  };
}

function understandingBand(state, analysis, action) {
  const unlocked = new Set(unlockedKnowledgeIds(state));
  const relevantMatches = analysis.matches.filter((match) =>
    action.keyConcepts.includes(match.concept),
  );
  const matchedConcepts = new Set(relevantMatches.map((match) => match.concept));
  const verifiedConcepts = new Set(
    relevantMatches.filter((match) => unlocked.has(match.nodeId)).map((match) => match.concept),
  );

  let band = "weak";
  if (matchedConcepts.size >= 2 || verifiedConcepts.size >= 1) band = "partial";
  if (
    matchedConcepts.size >= 4 &&
    verifiedConcepts.size >= 3 &&
    evidenceScore(state) >= 5
  ) {
    band = "strong";
  }

  return {
    band,
    matchedConcepts: [...matchedConcepts],
    verifiedConcepts: [...verifiedConcepts],
    inferredConcepts: [...matchedConcepts].filter((concept) => !verifiedConcepts.has(concept)),
    missingConcepts: action.keyConcepts.filter((concept) => !matchedConcepts.has(concept)),
  };
}

export function resolveWorldChallenge(state, understandingText, actionId) {
  const status = challengeAvailability(state);
  if (!status.allowed) return { state, error: status.reason };
  if (String(understandingText ?? "").trim().length < 12) {
    return { state, error: "先用至少一句完整的话写下你对局势的理解" };
  }

  const action = worldChallenge.actions.find((item) => item.id === actionId);
  if (!action) return { state, error: "请选择一个行动方向" };

  const analysis = evaluateUnderstanding(understandingText);
  const fit = understandingBand(state, analysis, action);
  const outcome = challengeOutcomes[action.id][fit.band];
  const snapshot = structuredClone(state);
  snapshot.challengeSnapshot = null;

  const next = structuredClone(state);
  next.challengeSnapshot = snapshot;
  next.challengeCompleted = true;
  next.day += outcome.days;
  next.money = Math.max(0, next.money + outcome.money);
  next.trust = Math.max(0, Math.min(100, next.trust + outcome.trust));
  next.business.process += outcome.process;
  if (outcome.money > 0) next.business.revenue += outcome.money;
  if (outcome.money < 0) next.business.costs += Math.abs(outcome.money);
  next.skills.opportunity += fit.band === "strong" ? 2 : fit.band === "partial" ? 1 : 0;
  next.skills.risk += fit.band === "strong" ? 2 : 0;
  next.skills.iteration += 1;
  next.challengeResult = {
    challengeId: worldChallenge.id,
    actionId: action.id,
    actionTitle: action.title,
    understandingText: analysis.text,
    ...fit,
    ...outcome,
  };
  next.relationships ??= {};
  if (action.id === "productizedService") {
    next.relationships.tangMan = clampRelationship(
      (next.relationships.tangMan ?? 42) + (fit.band === "strong" ? 10 : fit.band === "partial" ? 4 : -8),
    );
  }
  if (action.id === "platformPartner") {
    next.relationships.guYao = clampRelationship(
      (next.relationships.guYao ?? 0) + (fit.band === "strong" ? 62 : fit.band === "partial" ? 38 : 18),
    );
  }
  next.lastChallengeLesson = outcome.lesson;
  next.history.push({
    day: state.day,
    type: "worldChallenge",
    challengeId: worldChallenge.id,
    actionId,
    band: fit.band,
    title: outcome.title,
  });
  return { state: next, error: null };
}

export function rewindWorldChallenge(state) {
  if (!state.challengeSnapshot || !state.challengeResult) {
    return { state, error: "没有可以回溯的挑战节点" };
  }
  const lesson = state.challengeResult.lesson;
  const next = structuredClone(state.challengeSnapshot);
  next.rewinds = (state.rewinds ?? 0) + 1;
  next.lastChallengeLesson = lesson;
  next.challengeCompleted = false;
  next.challengeResult = null;
  next.challengeSnapshot = null;
  next.worldEvents.push({
    day: next.day,
    title: "认知回溯：你记得失败为什么发生",
    body: lesson,
  });
  next.history.push({ day: next.day, type: "rewind", lesson });
  return { state: next, error: null };
}

export function hypothesisEvidence(state, hypothesisId) {
  const related = state.evidence
    .map((id) => evidenceCatalog[id])
    .filter((item) => item?.supports.includes(hypothesisId));
  return {
    count: related.length,
    strength: related.reduce((sum, item) => sum + item.strength, 0),
  };
}

export function availability(state, action) {
  if (state.ended) return { allowed: false, reason: "本轮已经结束" };
  if (action.once && state.completed.includes(action.id)) {
    return { allowed: false, reason: "本轮已经完成" };
  }
  if (state.day + action.days - 1 > state.maxDay) {
    return { allowed: false, reason: "剩余时间不足" };
  }
  if (state.money < action.money) {
    return { allowed: false, reason: "现金不足" };
  }
  if (action.requires) {
    const missing = action.requires.find((flag) => !state.flags[flag]);
    if (missing) return { allowed: false, reason: requirementLabel(missing) };
  }
  if (action.requiresEvidence && evidenceScore(state) < Math.min(action.requiresEvidence, 2)) {
    return { allowed: false, reason: "先获得至少一条相关证据" };
  }
  return { allowed: true, reason: "" };
}

function requirementLabel(flag) {
  const labels = {
    proposalReady: "需要先提出小型试点",
    depositTaken: "需要先获得真实付款承诺",
    pilotDone: "需要先完成一次试点",
    processReady: "需要先建立可重复流程",
  };
  return labels[flag] ?? "前置条件尚未满足";
}

function mergeNumbers(target, delta = {}) {
  Object.entries(delta).forEach(([key, value]) => {
    target[key] = (target[key] ?? 0) + value;
  });
}

function addEvidence(next, ids = []) {
  ids.forEach((id) => {
    if (!next.evidence.includes(id)) next.evidence.push(id);
  });
}

function baseReport(action, trustDelta = 0) {
  return {
    title: action.title,
    experience: `第${action.days === 1 ? "一" : action.days}天的投入结束了。`,
    validation: action.report?.validation ?? "这次行动形成了新的现实反馈。",
    result: action.report?.result ?? "结果已经发生。",
    confirmed: action.report?.confirmed ?? "部分判断获得了新的证据。",
    unknown: action.report?.unknown ?? "仍有关键因素无法确定。",
    quote: action.report?.quote ?? "我需要根据结果重新判断下一步。",
    trustDelta,
    refused: false,
  };
}

function resolveConditional(next, action) {
  const score = evidenceScore(next);

  if (action.conditional === "personalityConflict") {
    next.trust = Math.max(0, next.trust - 3);
    next.flags.warmAlternative = true;
    return {
      consumed: false,
      report: {
        title: "主角调整了你的建议",
        experience: "你要求林澈立刻用高强度陌生拜访获取客户。",
        validation: "目标是增加客户接触，但方法没有考虑主角当前能力。",
        result: "林澈拒绝一天拜访30家店，但愿意请求熟人引荐并逐步增加陌生接触。",
        confirmed: "主角认同接触客户的目标。",
        unknown: "他能否在实践中逐渐适应更主动的销售方式。",
        quote: "我愿意面对客户，但不能假装自己今天就能变成另一个人。",
        trustDelta: -3,
        refused: true,
      },
    };
  }

  if (action.conditional === "valuesConflict") {
    next.trust = Math.max(0, next.trust - 8);
    return {
      consumed: false,
      report: {
        title: "主角拒绝执行",
        experience: "你建议未经授权导入客户聊天记录。",
        validation: "这个办法也许省时，却越过隐私与信任底线。",
        result: "林澈明确拒绝，并开始怀疑你是否理解他想成为怎样的人。",
        confirmed: "角色价值观是行动边界，不是可以用收益覆盖的数值。",
        unknown: "你们能否通过后续可靠建议修复信任。",
        quote: "如果创业需要先背着客户做这种事，那我不接受。",
        trustDelta: -8,
        refused: true,
      },
    };
  }

  if (action.conditional === "deposit") {
    if (score >= 5 && (next.flags.proposalReady || next.evidence.includes("pastLosses"))) {
      addEvidence(next, ["deposit"]);
      next.flags.depositTaken = true;
      next.business.revenue += 300;
      return {
        consumed: true,
        report: {
          title: "第一笔钱不是结局",
          experience: "你和客户明确了一周试点范围、责任边界和价格。",
          validation: "用真实付款区分礼貌兴趣与购买行为。",
          result: "客户支付300元定金，希望先处理一小部分咨询。",
          confirmed: "至少一位客户愿意为明确结果承担真实成本。",
          unknown: "交付能否可靠、后续是否续费、其他客户是否相同。",
          quote: "钱到账让我更有信心，也提醒我从现在开始要对结果负责。",
          trustDelta: 4,
          refused: false,
        },
        trustDelta: 4,
      };
    }
    return {
      consumed: true,
      markCompleted: false,
      report: {
        title: "赞同没有变成付款",
        experience: "你提出收费试点，但客户只愿意‘以后有机会看看’。",
        validation: "验证客户是否愿意为当前方案承担真实成本。",
        result: "客户没有付款。你们还没有证明问题、对象和方案足够匹配。",
        confirmed: "当前证据不足以支持付费假设。",
        unknown: "问题不够痛、客户不匹配、方案不清楚，还是价格不合适。",
        quote: "被拒绝不舒服，但至少它比一句‘挺好的’更有信息。",
        trustDelta: -2,
        refused: false,
      },
      trustDelta: -2,
    };
  }

  if (action.conditional === "fullBuild") {
    if (score < action.requiresEvidence) {
      if (next.trust < 50) {
        next.trust = Math.max(0, next.trust - 2);
        return {
          consumed: false,
          markCompleted: false,
          report: {
            title: "主角要求你先证明判断",
            experience: "在此前的错误建议之后，你再次要求林澈投入大量时间开发产品。",
            validation: "建议的投入很大，但当前证据仍然不足。",
            result: "林澈拒绝执行，并要求先看到客户行为或付款证据。",
            confirmed: "信任受损后，主角不再愿意替你的直觉承担大额风险。",
            unknown: "可靠的小型验证能否逐步修复你们的协作关系。",
            quote: "上一次我因为相信你付出了代价。这次请先给我足够的理由。",
            trustDelta: -2,
            refused: true,
          },
        };
      }
      next.flags.fullBuildFailed = true;
      next.business.costs += action.money;
      next.trust = Math.max(0, next.trust - 18);
      return {
        consumed: true,
        report: {
          title: "完整产品，空白订单",
          experience: "十天后产品完成了。功能很多，但你们仍说不清谁会购买。",
          validation: "你把开发本身当成了需求验证。",
          result: "没有客户愿意迁移现有流程，现金和毕业前时间大幅减少。",
          confirmed: "技术可行不等于商业可行。",
          unknown: "如果先找准客户和场景，其中哪些功能才真正需要。",
          quote: "我听了你的建议，但我们用十天证明了自己会开发，而不是客户会买。",
          trustDelta: -18,
          refused: false,
        },
      };
    }
    next.flags.productReady = true;
    next.business.costs += action.money;
    next.business.process += 2;
    next.trust = Math.min(100, next.trust + 2);
    return {
      consumed: true,
      report: {
        title: "有证据之后的产品化",
        experience: "你们依据已经发生的交付流程完成了一个小型工具。",
        validation: "验证重复步骤是否值得产品化。",
        result: "工具减少了重复整理，但人工审核仍然必要。",
        confirmed: "开发围绕已经观察到的流程展开。",
        unknown: "获客成本和更多客户的流程差异。",
        quote: "这次每个功能都能对应一个真实发生过的问题。",
        trustDelta: 2,
        refused: false,
      },
    };
  }

  return { consumed: true, report: baseReport(action) };
}

function triggerWorldEvents(next) {
  if (next.day >= 16 && !next.flags.priceShock) {
    next.flags.priceShock = true;
    next.worldEvents.push({
      day: next.day,
      title: "通用AI工具宣布降价",
      body: "客户问：既然工具这么便宜，为什么还要付钱给你？这削弱了‘卖AI功能’，却可能强化‘卖可靠流程与结果’。",
    });
  }
  if (next.day >= 31 && !next.flags.recruitmentWindow) {
    next.flags.recruitmentWindow = true;
    next.worldEvents.push({
      day: next.day,
      title: "校招窗口正在关闭",
      body: next.flags.fallbackReady
        ? "你保留的面试仍然有效，创业试验不必成为生死局。"
        : "大部分校招机会已经结束。创业方向仍可退出，但短期现金流退路变少。",
    });
  }
}

export function applyAction(state, actionId) {
  const action = actions.find((item) => item.id === actionId);
  if (!action) throw new Error(`Unknown action: ${actionId}`);

  const allowed = availability(state, action);
  if (!allowed.allowed) {
    return {
      state,
      error: allowed.reason,
    };
  }

  const next = structuredClone(state);
  let resolution = action.conditional
    ? resolveConditional(next, action)
    : { consumed: true, report: baseReport(action) };

  if (resolution.consumed) {
    next.day += action.days;
    next.money -= action.money;
    next.energy = Math.max(0, Math.min(100, next.energy - action.energy));
    if (next.energy < 18) next.trust = Math.max(0, next.trust - 2);

    addEvidence(next, action.evidence);
    Object.assign(next.flags, action.flags ?? {});
    mergeNumbers(next.business, action.business);
    mergeNumbers(next.skills, action.skill);

    if (action.once && resolution.markCompleted !== false) next.completed.push(action.id);
    if (action.id === "rest") next.energy = Math.min(100, state.energy + 18);

    const trustDelta = resolution.trustDelta ?? action.trustDelta ?? 0;
    next.trust = Math.max(0, Math.min(100, next.trust + trustDelta));
    triggerWorldEvents(next);
  } else if (action.once && resolution.markCompleted !== false) {
    next.completed.push(action.id);
  }

  next.lastReport = resolution.report;
  next.history.push({
    day: state.day,
    actionId,
    title: action.title,
    consumed: resolution.consumed,
    trust: next.trust,
    evidence: [...next.evidence],
  });

  if (next.day > next.maxDay) next.ended = true;
  return { state: next, error: null };
}

export function setHypothesis(state, hypothesisId, confidence) {
  if (!hypotheses.some((item) => item.id === hypothesisId)) {
    throw new Error(`Unknown hypothesis: ${hypothesisId}`);
  }
  const next = structuredClone(state);
  next.activeHypothesis = hypothesisId;
  next.confidence = Number(confidence);
  next.history.push({
    day: state.day,
    type: "hypothesis",
    hypothesisId,
    confidence: Number(confidence),
  });
  return next;
}

export function endGame(state) {
  const next = structuredClone(state);
  next.ended = true;
  next.lastReport = null;
  return next;
}

export function endingSummary(state) {
  const margin = state.business.revenue - state.business.costs;
  let businessStage = "尚未形成有效商业证据";
  if (state.business.paidPilots > 0) businessStage = "获得第一份付费与使用证据";
  if (state.business.repeatCustomers > 0 && state.business.process >= 2) {
    businessStage = "出现可重复经营的早期迹象";
  }
  if (state.flags.fullBuildFailed && state.business.paidPilots === 0) {
    businessStage = "过早产品化，尚未证明客户需求";
  }

  const capabilityTotal = Object.values(state.skills).reduce((a, b) => a + b, 0);
  let capability = "仍主要依靠直觉做决定";
  if (capabilityTotal >= 5) capability = "开始使用证据与风险上限推进";
  if (capabilityTotal >= 11) capability = "能够设计验证并根据反馈修正路线";
  if (capabilityTotal >= 17) capability = "形成了初步可迁移的创业认知框架";

  const trustText =
    state.trust >= 78
      ? "主角愿意与你共同承担下一次判断"
      : state.trust >= 50
        ? "主角仍会听取建议，但会要求更充分的理由"
        : "主角开始抵触你的判断，需要通过可靠的小行动修复关系";

  return {
    businessStage,
    capability,
    trustText,
    margin,
    evidence: state.evidence.length,
    lesson:
      state.business.repeatCustomers > 0
        ? "复购是新的证据，不是永久成功。下一阶段要验证陌生获客与交付容量。"
        : state.business.paidPilots > 0
          ? "第一笔付款证明了一个局部判断。下一步应验证复购、流程和真实人工成本。"
          : state.flags.fullBuildFailed
            ? "开发完成不是商业进展。下一次先验证客户过去的行为和付费承诺。"
            : "你保留了选择，但还没有把观察推进到足够强的现实承诺。",
  };
}

export function exportRun(state) {
  return JSON.stringify(
    {
      version: "0.8.0",
      exportedAt: new Date().toISOString(),
      state,
      summary: endingSummary(state),
    },
    null,
    2,
  );
}
