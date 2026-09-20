const storageKey = "zfl18-boardgame-rule-cards";
const today = new Date();

const reviewOrder = [
  ["disputes", "争议"],
  ["forgets", "遗忘"],
  ["setup", "准备"],
  ["scoring", "计分"]
];
const reviewLabels = Object.fromEntries(reviewOrder);

const defaultState = {
  selectedId: "",
  reviews: {},
  games: [
    {
      id: crypto.randomUUID(),
      name: "奥尔良",
      minPlayers: 2,
      maxPlayers: 4,
      duration: 90,
      complexity: "中",
      lastPlayed: "2025-11-20",
      cover: "",
      forgets: ["商站建造前先确认道路或水路连接", "袋中随从抽完后不是重洗弃堆，而是从已回袋内容继续抽"],
      disputes: ["事件顺序和玩家动作结算先后", "科技板是否能替代所有同类随从"],
      setup: ["按人数放置货物板块", "每位玩家拿起始随从、商人和个人板"],
      scoring: ["货物分数", "商站和市民乘区块", "金币和建筑剩余加分"]
    },
    {
      id: crypto.randomUUID(),
      name: "盖亚计划",
      minPlayers: 1,
      maxPlayers: 4,
      duration: 150,
      complexity: "重",
      lastPlayed: "2025-08-02",
      cover: "",
      forgets: ["联邦连接时卫星数量和能量消耗要一起核对", "研究升到顶必须拿对应科技板限制"],
      disputes: ["被动充能是否能拒绝", "星球改造费用受哪些能力影响"],
      setup: ["随机终局计分板和回合得分板", "按种族设置起始资源和母星"],
      scoring: ["终局计分板", "科技轨排名", "联邦和建筑分"]
    },
    {
      id: crypto.randomUUID(),
      name: "花砖物语",
      minPlayers: 2,
      maxPlayers: 4,
      duration: 45,
      complexity: "轻",
      lastPlayed: "2026-03-15",
      cover: "",
      forgets: ["每轮结束先铺墙再补工厂展示区", "地板线扣分后清空对应砖"],
      disputes: ["同色砖放置限制是否看整面墙", "中央区起始玩家标记是否必须拿"],
      setup: ["按人数放工厂圆盘", "每个圆盘补4块砖"],
      scoring: ["横竖相邻即时分", "完整行列和颜色终局加分"]
    }
  ]
};

let state = loadState();
if (!state.selectedId) state.selectedId = state.games[0]?.id || "";

let reviewUi = { mode: "idle", error: "" };
let ruleEditUi = null;

const els = {
  searchInput: document.querySelector("#searchInput"),
  playerFilter: document.querySelector("#playerFilter"),
  complexityFilter: document.querySelector("#complexityFilter"),
  sortMode: document.querySelector("#sortMode"),
  gameForm: document.querySelector("#gameForm"),
  nameInput: document.querySelector("#nameInput"),
  minPlayersInput: document.querySelector("#minPlayersInput"),
  maxPlayersInput: document.querySelector("#maxPlayersInput"),
  durationInput: document.querySelector("#durationInput"),
  complexityInput: document.querySelector("#complexityInput"),
  lastPlayedInput: document.querySelector("#lastPlayedInput"),
  coverInput: document.querySelector("#coverInput"),
  gameList: document.querySelector("#gameList"),
  detailView: document.querySelector("#detailView"),
  gameCount: document.querySelector("#gameCount"),
  ruleCount: document.querySelector("#ruleCount"),
  staleGame: document.querySelector("#staleGame"),
  visibleCount: document.querySelector("#visibleCount"),
  reviewDone: document.querySelector("#reviewDone"),
  pendingCount: document.querySelector("#pendingCount")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    return { ...structuredClone(defaultState), ...JSON.parse(saved) };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function daysSince(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function getAllRules(game) {
  return [...game.forgets, ...game.disputes, ...game.setup, ...game.scoring];
}

function rulesFingerprint(game) {
  return JSON.stringify([game.disputes, game.forgets, game.setup, game.scoring]);
}

function buildReviewSession(game) {
  const queue = [];
  reviewOrder.forEach(([key]) => {
    game[key].forEach((_, index) => queue.push(`${key}:${index}`));
  });
  return {
    fingerprint: rulesFingerprint(game),
    queue,
    current: 0,
    results: {},
    completed: false,
    completedAt: ""
  };
}

// 规则内容一旦变化（新增/编辑/移除），对应游戏立即退回未完成，已通过卡片重新排队
function syncReviews() {
  const ids = new Set(state.games.map((game) => game.id));
  Object.keys(state.reviews).forEach((id) => {
    if (!ids.has(id)) delete state.reviews[id];
  });
  state.games.forEach((game) => {
    const session = state.reviews[game.id];
    if (!session || session.fingerprint === rulesFingerprint(game)) return;
    const fresh = buildReviewSession(game);
    if (fresh.queue.length) {
      state.reviews[game.id] = fresh;
    } else {
      delete state.reviews[game.id];
    }
  });
}

function getReviewStatus(game) {
  const session = state.reviews[game.id];
  if (!session || !session.queue.length) return { state: "none", pending: 0 };
  const pending = Object.values(session.results).filter((result) => result.status === "pending").length;
  if (session.completed) {
    return { state: "done", pending, total: session.queue.length };
  }
  return { state: "active", current: session.current, total: session.queue.length, pending };
}

function advanceReview(session) {
  session.current += 1;
  if (session.current >= session.queue.length) {
    session.completed = true;
    session.completedAt = new Date().toISOString();
  }
}

function formatTime(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getFilteredGames() {
  const keyword = els.searchInput.value.trim();
  const player = els.playerFilter.value;
  const complexity = els.complexityFilter.value;
  const games = state.games.filter((game) => {
    const text = `${game.name}${getAllRules(game).join("")}`;
    const matchesKeyword = !keyword || text.includes(keyword);
    const matchesPlayer = player === "all" || (Number(player) >= game.minPlayers && Number(player) <= game.maxPlayers);
    const matchesComplexity = complexity === "all" || game.complexity === complexity;
    return matchesKeyword && matchesPlayer && matchesComplexity;
  });

  if (els.sortMode.value === "name") return games.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  if (els.sortMode.value === "complexity") {
    const rank = { 轻: 1, 中: 2, 重: 3 };
    return games.sort((a, b) => rank[b.complexity] - rank[a.complexity]);
  }
  return games.sort((a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed));
}

function renderSummary() {
  const allRuleCount = state.games.reduce((sum, game) => sum + getAllRules(game).length, 0);
  const stale = [...state.games].sort((a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed))[0];
  let reviewed = 0;
  let pendingTotal = 0;
  state.games.forEach((game) => {
    const status = getReviewStatus(game);
    if (status.state === "done") reviewed += 1;
    pendingTotal += status.pending;
  });
  els.gameCount.textContent = state.games.length;
  els.ruleCount.textContent = allRuleCount;
  els.staleGame.textContent = stale ? `${daysSince(stale.lastPlayed)}天` : "-";
  els.reviewDone.textContent = `${reviewed}/${state.games.length}`;
  els.pendingCount.textContent = pendingTotal;
}

function renderReviewBadge(game) {
  const status = getReviewStatus(game);
  if (status.state === "done") {
    return status.pending
      ? `<span class="review-badge warn">已复习 · 待确认 ${status.pending}</span>`
      : `<span class="review-badge ok">已复习</span>`;
  }
  if (status.state === "active") {
    return `<span class="review-badge doing">复习中 ${status.current}/${status.total}</span>`;
  }
  return `<span class="review-badge">未复习</span>`;
}

function renderList() {
  const games = getFilteredGames();
  els.visibleCount.textContent = `${games.length}个匹配`;
  els.gameList.innerHTML =
    games
      .map((game) => {
        const selected = game.id === state.selectedId ? "selected" : "";
        return `
          <article class="game-card ${selected}" data-game-id="${game.id}">
            <div class="cover">
              ${
                game.cover
                  ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />`
                  : `<span>${escapeHtml(game.name.slice(0, 2))}</span>`
              }
              <span class="stale-ribbon">${daysSince(game.lastPlayed)}天未玩</span>
            </div>
            <div class="game-body">
              <h3>${escapeHtml(game.name)}</h3>
              <div class="game-meta">
                <span class="pill">${game.minPlayers}-${game.maxPlayers}人</span>
                <span class="pill">${game.duration}分钟</span>
                <span class="pill heavy">${escapeHtml(game.complexity)}</span>
                ${renderReviewBadge(game)}
              </div>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">没有符合筛选的桌游。</p>`;
}

function renderReviewStation(game) {
  const session = state.reviews[game.id];

  if (!session) {
    const total = getAllRules(game).length;
    return `
      <section class="review-station">
        <div class="panel-head">
          <h3>聚会前复习台</h3>
          <span>争议 → 遗忘 → 准备 → 计分</span>
        </div>
        <p class="review-intro">${
          total
            ? `将按争议、遗忘、准备、计分的顺序生成 ${total} 张复习卡，逐张标记「已过」或「待确认」。`
            : "这个桌游还没有规则卡片，先在下方添加后再生成复习卡。"
        }</p>
        ${total ? `<button class="primary" id="startReviewBtn" type="button">生成复习卡</button>` : ""}
      </section>
    `;
  }

  if (session.completed) {
    const entries = session.queue.map((id) => {
      const [key, index] = id.split(":");
      return { key, text: game[key][Number(index)], result: session.results[id] };
    });
    const pendingItems = entries.filter((entry) => entry.result?.status === "pending");
    const passed = entries.length - pendingItems.length;
    return `
      <section class="review-station">
        <div class="panel-head">
          <h3>聚会前复习台</h3>
          <span>${formatTime(session.completedAt)} 完成</span>
        </div>
        <p class="review-done">✅ 本轮复习完成</p>
        <div class="game-meta">
          <span class="pill pass-pill">已过 ${passed}</span>
          <span class="pill pending-pill">待确认 ${pendingItems.length}</span>
        </div>
        ${
          pendingItems.length
            ? `<ul class="pending-list">
                ${pendingItems
                  .map(
                    (entry) => `
                      <li>
                        <span class="review-cat cat-${entry.key}">${reviewLabels[entry.key]}</span>
                        <div>
                          <p>${escapeHtml(entry.text)}</p>
                          <p class="pending-reason">原因：${escapeHtml(entry.result.reason)}</p>
                        </div>
                      </li>
                    `
                  )
                  .join("")}
              </ul>`
            : `<p class="review-intro">没有待确认项，可以安心开局。</p>`
        }
        <button id="restartReviewBtn" type="button">重新复习</button>
      </section>
    `;
  }

  const cardId = session.queue[session.current];
  const [key, index] = cardId.split(":");
  const text = game[key][Number(index)];
  const progress = Math.round((session.current / session.queue.length) * 100);

  let body = "";
  if (reviewUi.mode === "pending") {
    body = `
      <form id="reviewPendingForm" class="review-form">
        <label>
          待确认原因（必填）
          <textarea id="reviewReasonInput" rows="2" placeholder="例：结算顺序有分歧，开局前要查规则书确认" required></textarea>
        </label>
        ${reviewUi.error ? `<p class="form-error">${escapeHtml(reviewUi.error)}</p>` : ""}
        <div class="review-actions">
          <button class="primary" type="submit">确认标记</button>
          <button type="button" data-review-action="cancel">返回</button>
        </div>
      </form>
    `;
  } else if (reviewUi.mode === "edit") {
    body = `
      <form id="reviewEditForm" class="review-form">
        <label>
          编辑卡片内容
          <textarea id="reviewEditInput" rows="3" required>${escapeHtml(text)}</textarea>
        </label>
        <p class="review-hint">保存后本游戏将退回未完成，已通过卡片会重新排队。</p>
        <div class="review-actions">
          <button class="primary" type="submit">保存修改</button>
          <button type="button" data-review-action="cancel">返回</button>
        </div>
      </form>
    `;
  } else {
    body = `
      <div class="review-actions">
        <button class="primary" type="button" data-review-action="pass">已过</button>
        <button type="button" data-review-action="pending">待确认</button>
      </div>
      <div class="review-tools">
        <button type="button" data-review-action="edit">编辑此卡</button>
        <button type="button" data-review-action="remove">移除此卡</button>
      </div>
      <p class="review-hint">复习中编辑或移除卡片，本游戏将退回未完成并重新排队。</p>
    `;
  }

  return `
    <section class="review-station">
      <div class="panel-head">
        <h3>聚会前复习台</h3>
        <span>第 ${session.current + 1} / ${session.queue.length} 张</span>
      </div>
      <div class="phase-bar">
        ${reviewOrder
          .map(([phaseKey, label]) => {
            const total = game[phaseKey].length;
            const done = Object.keys(session.results).filter((id) => id.startsWith(`${phaseKey}:`)).length;
            const cls = total > 0 && done >= total ? "done" : phaseKey === key ? "active" : "";
            return `<span class="phase ${cls}">${label} ${done}/${total}</span>`;
          })
          .join("")}
      </div>
      <div class="progress"><div style="width:${progress}%"></div></div>
      <div class="review-card">
        <span class="review-cat cat-${key}">${reviewLabels[key]}</span>
        <p>${escapeHtml(text)}</p>
      </div>
      ${body}
    </section>
  `;
}

function renderDetail() {
  const game = state.games.find((item) => item.id === state.selectedId) || state.games[0];
  if (!game) {
    els.detailView.innerHTML = `<p class="empty">先添加一个桌游。</p>`;
    return;
  }
  state.selectedId = game.id;
  els.detailView.innerHTML = `
    <div class="quick-card">
      <div class="detail-cover">
        ${game.cover ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />` : `<span>${escapeHtml(game.name.slice(0, 2))}</span>`}
      </div>
      <div>
        <h2>${escapeHtml(game.name)}</h2>
        <div class="game-meta">
          <span class="pill">${game.minPlayers}-${game.maxPlayers}人</span>
          <span class="pill">${game.duration}分钟</span>
          <span class="pill heavy">${escapeHtml(game.complexity)}</span>
          <span class="pill">${daysSince(game.lastPlayed)}天未玩</span>
        </div>
      </div>
      ${renderReviewStation(game)}
      ${renderRuleSection("容易忘的规则", "forgets", game.forgets)}
      ${renderRuleSection("常见争议", "disputes", game.disputes)}
      ${renderRuleSection("开局准备", "setup", game.setup)}
      ${renderRuleSection("计分提醒", "scoring", game.scoring)}
      <form class="add-rule" id="ruleForm">
        <select id="ruleTypeInput">
          <option value="forgets">容易忘的规则</option>
          <option value="disputes">常见争议</option>
          <option value="setup">开局准备</option>
          <option value="scoring">计分提醒</option>
        </select>
        <textarea id="ruleTextInput" rows="3" placeholder="补充一条聚会前要看的提醒" required></textarea>
        <button class="primary" type="submit">加入规则卡片</button>
      </form>
      <div class="detail-actions">
        <button id="playedTodayBtn" type="button">标记今天玩过</button>
        <button id="deleteGameBtn" type="button">删除桌游</button>
      </div>
    </div>
  `;
}

function renderRuleSection(title, key, items) {
  return `
    <section class="rule-section">
      <h3>${title}</h3>
      <ul class="rule-list">
        ${
          items
            .map((item, index) => {
              const editing = ruleEditUi && ruleEditUi.key === key && ruleEditUi.index === index;
              if (editing) {
                return `
                  <li>
                    <form class="rule-edit-form">
                      <textarea rows="2" required>${escapeHtml(item)}</textarea>
                      <div class="rule-edit-actions">
                        <button class="primary" type="submit">保存</button>
                        <button type="button" data-rule-edit-cancel>取消</button>
                      </div>
                    </form>
                  </li>
                `;
              }
              return `
                <li>
                  <span>${escapeHtml(item)}</span>
                  <div class="rule-buttons">
                    <button type="button" title="编辑" data-rule-edit="${key}:${index}">✎</button>
                    <button type="button" title="删除" data-rule-key="${key}" data-rule-index="${index}">×</button>
                  </div>
                </li>
              `;
            })
            .join("") || `<li><span>暂无内容。</span></li>`
        }
      </ul>
    </section>
  `;
}

function renderAll() {
  syncReviews();
  saveState();
  renderSummary();
  renderList();
  renderDetail();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function addGame(event) {
  event.preventDefault();
  const minPlayers = Number(els.minPlayersInput.value);
  const maxPlayers = Math.max(minPlayers, Number(els.maxPlayersInput.value));
  const cover = await readFileAsDataUrl(els.coverInput.files[0]);
  const game = {
    id: crypto.randomUUID(),
    name: els.nameInput.value.trim(),
    minPlayers,
    maxPlayers,
    duration: Number(els.durationInput.value),
    complexity: els.complexityInput.value,
    lastPlayed: els.lastPlayedInput.value,
    cover,
    forgets: ["本局开始前先补充容易忘的规则。"],
    disputes: [],
    setup: ["整理组件并按人数调整初始设置。"],
    scoring: ["确认终局计分项和即时得分项。"]
  };
  state.games.unshift(game);
  state.selectedId = game.id;
  els.gameForm.reset();
  setDefaultDate();
  renderAll();
}

function setDefaultDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 2);
  els.lastPlayedInput.value = date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function focusField(selector) {
  const field = document.querySelector(selector);
  if (field) field.focus();
}

function handleReviewAction(game, action) {
  const session = state.reviews[game.id];
  if (!session || session.completed || !session.queue.length) return;
  const cardId = session.queue[session.current];

  if (action === "pass") {
    session.results[cardId] = { status: "passed" };
    advanceReview(session);
    reviewUi = { mode: "idle", error: "" };
    renderAll();
    return;
  }
  if (action === "pending") {
    reviewUi = { mode: "pending", error: "" };
    renderAll();
    focusField("#reviewReasonInput");
    return;
  }
  if (action === "edit") {
    reviewUi = { mode: "edit", error: "" };
    renderAll();
    focusField("#reviewEditInput");
    return;
  }
  if (action === "remove") {
    const [key, index] = cardId.split(":");
    game[key].splice(Number(index), 1);
    reviewUi = { mode: "idle", error: "" };
    renderAll();
    return;
  }
  if (action === "cancel") {
    reviewUi = { mode: "idle", error: "" };
    renderAll();
  }
}

els.searchInput.addEventListener("input", renderAll);
els.playerFilter.addEventListener("change", renderAll);
els.complexityFilter.addEventListener("change", renderAll);
els.sortMode.addEventListener("change", renderAll);
els.gameForm.addEventListener("submit", addGame);

els.gameList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-game-id]");
  if (!card) return;
  if (card.dataset.gameId !== state.selectedId) {
    reviewUi = { mode: "idle", error: "" };
    ruleEditUi = null;
  }
  state.selectedId = card.dataset.gameId;
  renderAll();
});

els.detailView.addEventListener("submit", (event) => {
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;

  if (event.target.id === "reviewPendingForm") {
    event.preventDefault();
    const session = state.reviews[game.id];
    if (!session || session.completed) return;
    const reason = document.querySelector("#reviewReasonInput").value.trim();
    if (!reason) {
      reviewUi = { mode: "pending", error: "待确认必须写明原因。" };
      renderAll();
      focusField("#reviewReasonInput");
      return;
    }
    session.results[session.queue[session.current]] = { status: "pending", reason };
    advanceReview(session);
    reviewUi = { mode: "idle", error: "" };
    renderAll();
    return;
  }

  if (event.target.id === "reviewEditForm") {
    event.preventDefault();
    const session = state.reviews[game.id];
    if (!session || session.completed) return;
    const text = document.querySelector("#reviewEditInput").value.trim();
    if (!text) return;
    const [key, index] = session.queue[session.current].split(":");
    game[key][Number(index)] = text;
    reviewUi = { mode: "idle", error: "" };
    renderAll();
    return;
  }

  if (event.target.classList.contains("rule-edit-form")) {
    event.preventDefault();
    if (!ruleEditUi) return;
    const text = event.target.querySelector("textarea").value.trim();
    if (!text) return;
    game[ruleEditUi.key][ruleEditUi.index] = text;
    ruleEditUi = null;
    renderAll();
    return;
  }

  if (event.target.id !== "ruleForm") return;
  event.preventDefault();
  const key = document.querySelector("#ruleTypeInput").value;
  const text = document.querySelector("#ruleTextInput").value.trim();
  if (!text) return;
  game[key].push(text);
  renderAll();
});

els.detailView.addEventListener("click", (event) => {
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;

  const reviewButton = event.target.closest("[data-review-action]");
  if (reviewButton) {
    handleReviewAction(game, reviewButton.dataset.reviewAction);
    return;
  }

  if (event.target.closest("#startReviewBtn") || event.target.closest("#restartReviewBtn")) {
    state.reviews[game.id] = buildReviewSession(game);
    reviewUi = { mode: "idle", error: "" };
    renderAll();
    return;
  }

  const ruleEditButton = event.target.closest("[data-rule-edit]");
  if (ruleEditButton) {
    const [key, index] = ruleEditButton.dataset.ruleEdit.split(":");
    ruleEditUi = { key, index: Number(index) };
    renderAll();
    focusField(".rule-edit-form textarea");
    return;
  }

  if (event.target.closest("[data-rule-edit-cancel]")) {
    ruleEditUi = null;
    renderAll();
    return;
  }

  const ruleButton = event.target.closest("[data-rule-key]");
  const playedButton = event.target.closest("#playedTodayBtn");
  const deleteButton = event.target.closest("#deleteGameBtn");

  if (ruleButton) {
    const key = ruleButton.dataset.ruleKey;
    const index = Number(ruleButton.dataset.ruleIndex);
    game[key].splice(index, 1);
    ruleEditUi = null;
    renderAll();
  }

  if (playedButton) {
    game.lastPlayed = new Date().toISOString().slice(0, 10);
    renderAll();
  }

  if (deleteButton) {
    state.games = state.games.filter((item) => item.id !== game.id);
    state.selectedId = state.games[0]?.id || "";
    reviewUi = { mode: "idle", error: "" };
    ruleEditUi = null;
    renderAll();
  }
});

setDefaultDate();
renderAll();
