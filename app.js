const storageKey = "zfl18-boardgame-rule-cards";
const today = new Date();

// 复习台处理顺序：争议 → 遗忘 → 准备 → 计分
const reviewOrder = ["disputes", "forgets", "setup", "scoring"];
const categoryMeta = {
  disputes: { label: "常见争议", short: "争议" },
  forgets: { label: "容易忘的规则", short: "遗忘" },
  setup: { label: "开局准备", short: "准备" },
  scoring: { label: "计分提醒", short: "计分" }
};

const defaultState = {
  selectedId: "",
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

// 仅详情页的瞬态界面状态，不持久化
const ui = {
  pendingReason: false,
  reasonError: false,
  editing: null
};

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
  reviewedCount: document.querySelector("#reviewedCount"),
  pendingCount: document.querySelector("#pendingCount"),
  visibleCount: document.querySelector("#visibleCount")
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

function buildQueue(game) {
  return reviewOrder.flatMap((key) => game[key].map((text) => ({ key, text })));
}

function createReview(game) {
  return {
    status: "active",
    queue: buildQueue(game),
    position: 0,
    marks: {},
    startedAt: new Date().toISOString(),
    completedAt: null
  };
}

function startReview(game) {
  game.review = createReview(game);
}

// 复习中编辑或移除卡片：立即退回未完成，已通过项全部重新排队
function resetReview(game) {
  if (game.review) game.review = createReview(game);
}

function getReviewStats(game) {
  const review = game.review;
  if (!review) return { total: 0, done: 0, passed: 0, pending: 0 };
  const marks = Object.values(review.marks);
  return {
    total: review.queue.length,
    done: Math.min(review.position, review.queue.length),
    passed: marks.filter((mark) => mark.result === "passed").length,
    pending: marks.filter((mark) => mark.result === "pending").length
  };
}

function markCurrentCard(game, result, reason = "") {
  const review = game.review;
  if (!review || review.status !== "active" || review.position >= review.queue.length) return;
  review.marks[review.position] = reason ? { result, reason } : { result };
  review.position += 1;
  if (review.position >= review.queue.length) {
    review.status = "done";
    review.completedAt = new Date().toISOString();
  }
}

function resetDetailUi() {
  ui.pendingReason = false;
  ui.reasonError = false;
  ui.editing = null;
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
  const reviewed = state.games.filter((game) => game.review?.status === "done").length;
  const pendingTotal = state.games.reduce((sum, game) => sum + getReviewStats(game).pending, 0);
  els.gameCount.textContent = state.games.length;
  els.ruleCount.textContent = allRuleCount;
  els.staleGame.textContent = stale ? `${daysSince(stale.lastPlayed)}天` : "-";
  els.reviewedCount.textContent = `${reviewed}/${state.games.length}`;
  els.pendingCount.textContent = pendingTotal;
}

function renderReviewBadge(game) {
  const review = game.review;
  if (!review) return `<span class="pill review-none">未复习</span>`;
  const stats = getReviewStats(game);
  if (review.status === "done") {
    return `<span class="pill review-done">已复习</span>${
      stats.pending ? `<span class="pill review-pending">待确认 ${stats.pending}</span>` : ""
    }`;
  }
  return `<span class="pill review-active">复习中 ${stats.done}/${stats.total}</span>`;
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
      ${renderReviewDesk(game)}
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

function renderReviewDesk(game) {
  const review = game.review;

  if (!review) {
    const total = buildQueue(game).length;
    return `
      <section class="review-desk">
        <div class="review-head">
          <h3>聚会前复习台</h3>
          <span class="pill review-none">未开始</span>
        </div>
        <p class="review-hint">按 争议 → 遗忘 → 准备 → 计分 的顺序生成 ${total} 张待复习卡，逐张标记「已过」或「待确认」。</p>
        <button class="primary" id="startReviewBtn" type="button" ${total ? "" : "disabled"}>生成待复习卡</button>
        ${total ? "" : `<p class="field-error">请先在下方添加规则卡片。</p>`}
      </section>
    `;
  }

  if (review.status === "done") {
    const stats = getReviewStats(game);
    const pendingItems = review.queue
      .map((card, index) => ({ card, mark: review.marks[index] }))
      .filter((item) => item.mark && item.mark.result === "pending");
    return `
      <section class="review-desk">
        <div class="review-head">
          <h3>复习完成</h3>
          <span class="pill review-done">已完成</span>
        </div>
        <p class="review-hint">共 ${stats.total} 张 · 已过 ${stats.passed} · 待确认 ${stats.pending}${
          review.completedAt ? ` · 完成于 ${review.completedAt.slice(0, 10)}` : ""
        }</p>
        ${
          pendingItems.length
            ? `<ul class="pending-list">
                ${pendingItems
                  .map(
                    ({ card, mark }) => `
                      <li>
                        <div class="pending-card">
                          <span class="pill cat-${card.key}">${categoryMeta[card.key].short}</span>
                          <span>${escapeHtml(card.text)}</span>
                        </div>
                        <span class="pending-reason-text">原因：${escapeHtml(mark.reason)}</span>
                      </li>
                    `
                  )
                  .join("")}
              </ul>`
            : `<p class="review-hint">没有待确认项，可以放心开局。</p>`
        }
        <button id="restartReviewBtn" type="button">重新复习</button>
      </section>
    `;
  }

  if (!review.queue.length) {
    return `
      <section class="review-desk">
        <div class="review-head">
          <h3>聚会前复习台</h3>
          <span class="pill review-active">复习中</span>
        </div>
        <p class="review-hint">当前没有待复习卡片，请在下方添加规则卡片。</p>
        <button id="restartReviewBtn" type="button">重新生成</button>
      </section>
    `;
  }

  const card = review.queue[review.position];
  const progress = Math.round((review.position / review.queue.length) * 100);
  return `
    <section class="review-desk">
      <div class="review-head">
        <h3>复习台</h3>
        <span class="pill review-active">第 ${review.position + 1} / ${review.queue.length} 张</span>
      </div>
      <div class="review-progress"><span style="width: ${progress}%"></span></div>
      <div class="review-card">
        <span class="pill cat-${card.key}">${categoryMeta[card.key].label}</span>
        <p>${escapeHtml(card.text)}</p>
      </div>
      ${
        ui.pendingReason
          ? `<form class="pending-reason" id="pendingReasonForm">
              <label>
                待确认原因（必填）
                <textarea id="pendingReasonInput" rows="2" placeholder="例：规则书出处不确定，开局前要查证" autofocus required></textarea>
              </label>
              ${ui.reasonError ? `<p class="field-error">待确认必须写明原因。</p>` : ""}
              <div class="review-actions">
                <button class="primary" type="submit">确认待确认</button>
                <button type="button" id="cancelPendingBtn">返回</button>
              </div>
            </form>`
          : `<div class="review-actions">
              <button class="primary" id="markPassedBtn" type="button">已过</button>
              <button id="markPendingBtn" type="button">待确认</button>
            </div>`
      }
      <button id="restartReviewBtn" type="button">重新开始</button>
    </section>
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
              const isEditing = ui.editing && ui.editing.key === key && ui.editing.index === index;
              if (isEditing) {
                return `
                  <li>
                    <form class="edit-rule" id="editRuleForm">
                      <textarea id="editRuleText" rows="2" required>${escapeHtml(item)}</textarea>
                      <div class="edit-actions">
                        <button class="primary" type="submit">保存</button>
                        <button type="button" id="cancelEditBtn">取消</button>
                      </div>
                    </form>
                  </li>
                `;
              }
              return `
                <li>
                  <span>${escapeHtml(item)}</span>
                  <div class="rule-buttons">
                    <button type="button" title="编辑" data-edit-key="${key}" data-edit-index="${index}">✎</button>
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
  resetDetailUi();
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

els.searchInput.addEventListener("input", renderAll);
els.playerFilter.addEventListener("change", renderAll);
els.complexityFilter.addEventListener("change", renderAll);
els.sortMode.addEventListener("change", renderAll);
els.gameForm.addEventListener("submit", addGame);

els.gameList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-game-id]");
  if (!card) return;
  if (card.dataset.gameId !== state.selectedId) resetDetailUi();
  state.selectedId = card.dataset.gameId;
  renderAll();
});

els.detailView.addEventListener("submit", (event) => {
  event.preventDefault();
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;

  if (event.target.id === "ruleForm") {
    const key = document.querySelector("#ruleTypeInput").value;
    const text = document.querySelector("#ruleTextInput").value.trim();
    if (!text) return;
    game[key].push(text);
    // 复习会话存在时新卡直接入队；已完成的会话因此退回未完成
    const review = game.review;
    if (review) {
      review.queue.push({ key, text });
      if (review.status === "done") {
        review.status = "active";
        review.completedAt = null;
      }
    }
    renderAll();
    return;
  }

  if (event.target.id === "editRuleForm") {
    const text = document.querySelector("#editRuleText").value.trim();
    if (!text || !ui.editing) return;
    game[ui.editing.key][ui.editing.index] = text;
    ui.editing = null;
    resetReview(game);
    renderAll();
    return;
  }

  if (event.target.id === "pendingReasonForm") {
    const reason = document.querySelector("#pendingReasonInput").value.trim();
    if (!reason) {
      ui.reasonError = true;
      renderAll();
      return;
    }
    markCurrentCard(game, "pending", reason);
    ui.pendingReason = false;
    ui.reasonError = false;
    renderAll();
  }
});

els.detailView.addEventListener("click", (event) => {
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;

  const ruleButton = event.target.closest("[data-rule-key]");
  if (ruleButton) {
    const key = ruleButton.dataset.ruleKey;
    const index = Number(ruleButton.dataset.ruleIndex);
    game[key].splice(index, 1);
    resetReview(game);
    resetDetailUi();
    renderAll();
    return;
  }

  const editButton = event.target.closest("[data-edit-key]");
  if (editButton) {
    ui.editing = { key: editButton.dataset.editKey, index: Number(editButton.dataset.editIndex) };
    ui.pendingReason = false;
    ui.reasonError = false;
    renderAll();
    return;
  }

  if (event.target.closest("#cancelEditBtn")) {
    ui.editing = null;
    renderAll();
    return;
  }

  if (event.target.closest("#startReviewBtn") || event.target.closest("#restartReviewBtn")) {
    startReview(game);
    resetDetailUi();
    renderAll();
    return;
  }

  if (event.target.closest("#markPassedBtn")) {
    markCurrentCard(game, "passed");
    resetDetailUi();
    renderAll();
    return;
  }

  if (event.target.closest("#markPendingBtn")) {
    ui.pendingReason = true;
    ui.reasonError = false;
    renderAll();
    return;
  }

  if (event.target.closest("#cancelPendingBtn")) {
    ui.pendingReason = false;
    ui.reasonError = false;
    renderAll();
    return;
  }

  if (event.target.closest("#playedTodayBtn")) {
    game.lastPlayed = new Date().toISOString().slice(0, 10);
    renderAll();
    return;
  }

  if (event.target.closest("#deleteGameBtn")) {
    state.games = state.games.filter((item) => item.id !== game.id);
    state.selectedId = state.games[0]?.id || "";
    resetDetailUi();
    renderAll();
  }
});

setDefaultDate();
renderAll();
