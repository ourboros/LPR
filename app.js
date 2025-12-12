// ============================================
// 教案輔助評論系統 - 主要 JavaScript 功能
// ============================================

// === 全局狀態管理 ===
const AppState = {
  sources: [],
  currentChat: [],
  notes: [],
  scores: {
    objectives: 0,
    content: 0,
    innovation: 0,
    assessment: 0,
    timing: 0,
  },
  selectedSources: [],
  currentTab: "notes",
};

// === DOM 元素引用 ===
const DOM = {
  // 來源面板
  addSourceBtn: document.getElementById("addSourceBtn"),
  uploadArea: document.getElementById("uploadArea"),
  uploadZone: document.getElementById("uploadZone"),
  fileInput: document.getElementById("fileInput"),
  cancelUploadBtn: document.getElementById("cancelUploadBtn"),
  sourcesList: document.getElementById("sourcesList"),
  searchInput: document.getElementById("searchInput"),

  // 對話面板
  chatContent: document.getElementById("chatContent"),
  chatInput: document.getElementById("chatInput"),
  sendBtn: document.getElementById("sendBtn"),
  selectedSources: document.getElementById("selectedSources"),

  // 記事面板
  notesList: document.getElementById("notesList"),
  addNoteBtn: document.getElementById("addNoteBtn"),
  tabs: document.querySelectorAll(".tab"),
  tabContents: document.querySelectorAll(".tab-content"),

  // 評分
  scoreCategories: document.getElementById("scoreCategories"),
  totalScore: document.getElementById("totalScore"),
  scoreComment: document.getElementById("scoreComment"),
  submitScoreBtn: document.getElementById("submitScoreBtn"),

  // 模態框
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  closeModalBtn: document.getElementById("closeModalBtn"),

  // 導航
  shareBtn: document.getElementById("shareBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
};

// === 初始化 ===
function init() {
  setupEventListeners();
  loadSampleData();
  setupAutoResize();
}

// === 事件監聽器設置 ===
function setupEventListeners() {
  // 來源管理
  DOM.addSourceBtn.addEventListener("click", showUploadArea);
  DOM.cancelUploadBtn.addEventListener("click", hideUploadArea);
  DOM.uploadZone.addEventListener("click", () => DOM.fileInput.click());
  DOM.uploadZone.addEventListener("dragover", handleDragOver);
  DOM.uploadZone.addEventListener("drop", handleFileDrop);
  DOM.fileInput.addEventListener("change", handleFileSelect);
  DOM.searchInput.addEventListener("input", handleSearch);

  // 對話功能
  DOM.sendBtn.addEventListener("click", sendMessage);
  DOM.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 建議操作
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", handleSuggestionClick);
  });

  // 標籤切換
  DOM.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // 記事管理
  DOM.addNoteBtn.addEventListener("click", addNote);

  // 評分功能
  setupRatingStars();
  DOM.submitScoreBtn.addEventListener("click", submitScore);

  // 生成內容
  document.querySelectorAll(".content-card").forEach((card) => {
    card.addEventListener("click", () => generateContent(card.dataset.action));
  });

  // 模態框
  DOM.closeModalBtn.addEventListener("click", closeModal);
  DOM.modal.addEventListener("click", (e) => {
    if (e.target === DOM.modal) closeModal();
  });

  // 導航功能
  DOM.shareBtn.addEventListener("click", showShareDialog);
  DOM.settingsBtn.addEventListener("click", showSettingsDialog);
}

// === 來源管理功能 ===
function showUploadArea() {
  DOM.uploadArea.classList.remove("hidden");
}

function hideUploadArea() {
  DOM.uploadArea.classList.add("hidden");
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  DOM.uploadZone.style.borderColor = "var(--primary-purple)";
  DOM.uploadZone.style.background = "var(--bg-hover)";
}

function handleFileDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  DOM.uploadZone.style.borderColor = "";
  DOM.uploadZone.style.background = "";

  const files = e.dataTransfer.files;
  processFiles(files);
}

function handleFileSelect(e) {
  const files = e.target.files;
  processFiles(files);
}

function processFiles(files) {
  Array.from(files).forEach((file) => {
    const source = {
      id: Date.now() + Math.random(),
      name: file.name,
      type: file.type,
      size: file.size,
      uploadDate: new Date(),
      selected: false,
    };

    AppState.sources.push(source);
    addSourceToList(source);
  });

  hideUploadArea();
  showNotification("成功上傳 " + files.length + " 個教案文件");
}

function addSourceToList(source) {
  const emptyState = DOM.sourcesList.querySelector(".empty-state");
  if (emptyState) {
    emptyState.remove();
  }

  const sourceItem = document.createElement("div");
  sourceItem.className = "source-item";
  sourceItem.dataset.id = source.id;

  const fileIcon = getFileIcon(source.type);
  const fileSize = formatFileSize(source.size);
  const uploadDate = formatDate(source.uploadDate);

  sourceItem.innerHTML = `
        <div class="source-title">
            <span class="material-symbols-outlined">${fileIcon}</span>
            ${source.name}
        </div>
        <div class="source-meta">
            <span>${fileSize}</span>
            <span>${uploadDate}</span>
        </div>
    `;

  sourceItem.addEventListener("click", () =>
    toggleSourceSelection(source.id, sourceItem)
  );
  DOM.sourcesList.appendChild(sourceItem);
}

function toggleSourceSelection(sourceId, element) {
  const source = AppState.sources.find((s) => s.id === sourceId);
  if (!source) return;

  source.selected = !source.selected;
  element.classList.toggle("selected");

  if (source.selected) {
    AppState.selectedSources.push(source);
    addSelectedSourceTag(source);
  } else {
    AppState.selectedSources = AppState.selectedSources.filter(
      (s) => s.id !== sourceId
    );
    removeSelectedSourceTag(sourceId);
  }
}

function addSelectedSourceTag(source) {
  const tag = document.createElement("div");
  tag.className = "source-tag";
  tag.dataset.id = source.id;
  tag.innerHTML = `
        <span>${source.name}</span>
        <span class="remove material-symbols-outlined">close</span>
    `;

  tag.querySelector(".remove").addEventListener("click", () => {
    toggleSourceSelection(
      source.id,
      document.querySelector(`[data-id="${source.id}"]`)
    );
  });

  DOM.selectedSources.appendChild(tag);
}

function removeSelectedSourceTag(sourceId) {
  const tag = DOM.selectedSources.querySelector(`[data-id="${sourceId}"]`);
  if (tag) tag.remove();
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase();
  const sourceItems = DOM.sourcesList.querySelectorAll(".source-item");

  sourceItems.forEach((item) => {
    const title = item.querySelector(".source-title").textContent.toLowerCase();
    item.style.display = title.includes(query) ? "block" : "none";
  });
}

// === 對話功能 ===
function sendMessage() {
  const message = DOM.chatInput.value.trim();
  if (!message) return;

  // 移除歡迎訊息
  const welcomeMsg = DOM.chatContent.querySelector(".welcome-message");
  if (welcomeMsg) welcomeMsg.remove();

  // 添加用戶訊息
  addMessage("user", message);
  DOM.chatInput.value = "";

  // 模擬 AI 回應
  setTimeout(() => {
    const response = generateAIResponse(message);
    addMessage("assistant", response);
  }, 1000);
}

function addMessage(role, content) {
  const message = document.createElement("div");
  message.className = `message ${role}`;

  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  messageContent.textContent = content;

  message.appendChild(messageContent);

  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.innerHTML = `
            <button onclick="saveToNotes(this)">
                <span class="material-symbols-outlined">bookmark</span>
                儲存至記事
            </button>
            <button onclick="copyMessage(this)">
                <span class="material-symbols-outlined">content_copy</span>
                複製
            </button>
        `;
    message.appendChild(actions);
  }

  DOM.chatContent.appendChild(message);
  DOM.chatContent.scrollTop = DOM.chatContent.scrollHeight;

  AppState.currentChat.push({ role, content, timestamp: new Date() });
}

function generateAIResponse(message) {
  const responses = {
    default: `我已經分析了您的問題「${message}」。基於上傳的教案內容，我可以提供以下見解：\n\n這份教案展現了清晰的教學目標和結構化的內容組織。建議在教學方法上可以增加更多互動元素，以提升學生參與度。`,
    analyze:
      "根據教案分析，這份教案包含以下結構：\n1. 教學目標明確定義\n2. 內容組織完整\n3. 教學活動設計合理\n4. 評量方式多元\n\n建議可以加強教學方法的創新性。",
    score:
      "教案品質評估：\n• 教學目標明確性：4.0/5.0\n• 內容組織完整性：4.5/5.0\n• 教學方法創新性：3.5/5.0\n• 評量設計適切性：4.0/5.0\n• 時間規劃合理性：4.0/5.0\n\n總體評分：4.0/5.0",
    suggest:
      "改進建議：\n1. 增加小組討論活動，提升學生互動\n2. 納入更多實例和案例分析\n3. 設計多元評量方式\n4. 考慮差異化教學策略\n5. 加強科技工具的整合",
    compare:
      "教案比較分析：\n請選擇至少兩份教案進行比較。我將從教學目標、內容深度、教學方法、評量設計等維度進行全面比較分析。",
  };

  // 檢查關鍵字匹配
  for (const [key, response] of Object.entries(responses)) {
    if (key !== "default" && message.includes(key)) {
      return response;
    }
  }

  return responses.default;
}

function handleSuggestionClick(e) {
  const action = e.target.dataset.action;
  const prompts = {
    analyze: "請分析這份教案的整體結構和組織方式",
    score: "請評估這份教案的品質並給出各項評分",
    suggest: "請提供這份教案的具體改進建議",
    compare: "請比較選定的教案之間的差異",
  };

  DOM.chatInput.value = prompts[action] || "";
  DOM.chatInput.focus();
}

// === 記事功能 ===
function switchTab(tabName) {
  DOM.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  DOM.tabContents.forEach((content) => {
    content.classList.toggle("active", content.id === `${tabName}Tab`);
  });

  AppState.currentTab = tabName;
}

function addNote() {
  const noteContent = prompt("請輸入記事內容：");
  if (!noteContent) return;

  const note = {
    id: Date.now(),
    title: noteContent.slice(0, 30) + (noteContent.length > 30 ? "..." : ""),
    content: noteContent,
    createdAt: new Date(),
  };

  AppState.notes.push(note);
  renderNotes();
  showNotification("記事已新增");
}

function renderNotes() {
  const emptyState = DOM.notesList.querySelector(".empty-state");
  if (emptyState && AppState.notes.length > 0) {
    emptyState.remove();
  }

  if (AppState.notes.length === 0) {
    DOM.notesList.innerHTML = `
            <div class="empty-state small">
                <span class="material-symbols-outlined">note</span>
                <p>尚無記事</p>
            </div>
        `;
    return;
  }

  DOM.notesList.innerHTML = "";
  AppState.notes.forEach((note) => {
    const noteCard = document.createElement("div");
    noteCard.className = "note-card";
    noteCard.innerHTML = `
            <div class="note-title">${note.title}</div>
            <div class="note-preview">${note.content}</div>
            <div class="note-meta">${formatDate(note.createdAt)}</div>
        `;
    noteCard.addEventListener("click", () => viewNote(note));
    DOM.notesList.appendChild(noteCard);
  });
}

function viewNote(note) {
  // 切換到記事標籤頁
  switchTab("notes");

  // 在記事列表上方顯示詳細內容
  const notesList = DOM.notesList;

  // 移除之前的詳細顯示（如果有）
  const existingDetail = document.querySelector(".note-detail");
  if (existingDetail) {
    existingDetail.remove();
  }

  // 創建詳細內容區域
  const noteDetail = document.createElement("div");
  noteDetail.className = "note-detail";
  noteDetail.innerHTML = `
    <div class="note-detail-header">
      <h4>${note.title}</h4>
      <button class="close-detail-btn" onclick="closeNoteDetail()">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <p class="note-detail-meta">${formatDate(note.createdAt)}</p>
    <div class="note-detail-content">${note.content}</div>
  `;

  // 插入到記事列表前面
  notesList.parentElement.insertBefore(noteDetail, notesList);
}

function saveToNotes(button) {
  const messageContent = button
    .closest(".message")
    .querySelector(".message-content").textContent;
  const note = {
    id: Date.now(),
    title: messageContent.slice(0, 30) + "...",
    content: messageContent,
    createdAt: new Date(),
  };

  AppState.notes.push(note);
  renderNotes();
  showNotification("已儲存至記事");
}

function copyMessage(button) {
  const messageContent = button
    .closest(".message")
    .querySelector(".message-content").textContent;
  navigator.clipboard.writeText(messageContent).then(() => {
    showNotification("已複製到剪貼簿");
  });
}

// === 評分功能 ===
function setupRatingStars() {
  document.querySelectorAll(".rating-stars").forEach((container) => {
    const stars = container.querySelectorAll(".star");
    const category = container.dataset.category;

    stars.forEach((star) => {
      star.addEventListener("click", () => {
        const value = parseInt(star.dataset.value);
        AppState.scores[category] = value;
        updateStars(container, value);
        updateTotalScore();
      });

      star.addEventListener("mouseenter", () => {
        const value = parseInt(star.dataset.value);
        updateStars(container, value, true);
      });
    });

    container.addEventListener("mouseleave", () => {
      updateStars(container, AppState.scores[category]);
    });
  });
}

function updateStars(container, value, isHover = false) {
  const stars = container.querySelectorAll(".star");
  stars.forEach((star, index) => {
    if (index < value) {
      star.textContent = "★";
      star.classList.add("active");
    } else {
      star.textContent = "☆";
      star.classList.remove("active");
    }
  });
}

function updateTotalScore() {
  const scores = Object.values(AppState.scores);
  const total = scores.reduce((sum, score) => sum + score, 0);
  const average = scores.length > 0 ? (total / scores.length).toFixed(1) : 0;
  DOM.totalScore.textContent = average;
}

function submitScore() {
  const comment = DOM.scoreComment.value.trim();
  const scores = { ...AppState.scores };
  const total = parseFloat(DOM.totalScore.textContent);

  if (total === 0) {
    showNotification("請先進行評分", "warning");
    return;
  }

  // 儲存評分記錄
  const scoreRecord = {
    id: Date.now(),
    scores,
    total,
    comment,
    timestamp: new Date(),
  };

  console.log("評分已提交:", scoreRecord);
  showNotification("評分已提交成功");

  // 可選：重置評分
  // resetScores();
}

function resetScores() {
  Object.keys(AppState.scores).forEach((key) => {
    AppState.scores[key] = 0;
  });

  document.querySelectorAll(".rating-stars").forEach((container) => {
    updateStars(container, 0);
  });

  updateTotalScore();
  DOM.scoreComment.value = "";
}

// === 生成內容功能 ===
function generateContent(action) {
  if (AppState.selectedSources.length === 0) {
    showNotification("請先選擇教案來源", "warning");
    return;
  }

  const actions = {
    summary: { title: "教案摘要", content: generateSummary() },
    rubric: { title: "評分量表", content: generateRubric() },
    mindmap: { title: "概念圖", content: generateMindmap() },
    report: { title: "評論報告", content: generateReport() },
  };

  const result = actions[action];
  if (result) {
    DOM.modalTitle.textContent = result.title;
    DOM.modalBody.innerHTML = result.content;
    DOM.modal.classList.remove("hidden");
  }
}

function generateSummary() {
  return `
        <h4>教案摘要</h4>
        <div style="margin-top: 16px; line-height: 1.8;">
            <p><strong>教學主題：</strong>數學幾何圖形認識</p>
            <p><strong>適用年級：</strong>國小三年級</p>
            <p><strong>教學時間：</strong>40分鐘</p>
            <p><strong>教學目標：</strong></p>
            <ul style="margin-left: 20px;">
                <li>認識基本幾何圖形的特徵</li>
                <li>能夠辨識日常生活中的幾何圖形</li>
                <li>培養空間概念與觀察能力</li>
            </ul>
            <p><strong>教學重點：</strong>透過實物操作和互動遊戲，讓學生在輕鬆的氛圍中學習幾何概念。</p>
        </div>
    `;
}

function generateRubric() {
  return `
        <h4>評分量表</h4>
        <table style="width: 100%; margin-top: 16px; border-collapse: collapse;">
            <thead>
                <tr style="background: var(--bg-tertiary);">
                    <th style="padding: 12px; border: 1px solid var(--border-light);">評分項目</th>
                    <th style="padding: 12px; border: 1px solid var(--border-light);">優秀(5分)</th>
                    <th style="padding: 12px; border: 1px solid var(--border-light);">良好(3-4分)</th>
                    <th style="padding: 12px; border: 1px solid var(--border-light);">待改進(1-2分)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding: 12px; border: 1px solid var(--border-light);"><strong>教學目標</strong></td>
                    <td style="padding: 12px; border: 1px solid var(--border-light);">目標明確具體可評量</td>
                    <td style="padding: 12px; border: 1px solid var(--border-light);">目標清楚但不夠具體</td>
                    <td style="padding: 12px; border: 1px solid var(--border-light);">目標模糊不清</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid var(--border-light);"><strong>內容組織</strong></td>
                    <td style="padding: 12px; border: 1px solid var(--border-light);">結構完整邏輯清晰</td>
                    <td style="padding: 12px; border: 1px solid var(--border-light);">結構尚可稍欠邏輯</td>
                    <td style="padding: 12px; border: 1px solid var(--border-light);">結構鬆散缺乏組織</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid var(--border-light);"><strong>教學方法</strong></td>
                    <td style="padding: 12px; border: 1px solid var(--border-light);">方法多元富創意</td>
                    <td style="padding: 12px; border: 1px solid var(--border-light);">方法適當但較傳統</td>
                    <td style="padding: 12px; border: 1px solid var(--border-light);">方法單一缺乏變化</td>
                </tr>
            </tbody>
        </table>
    `;
}

function generateMindmap() {
  return `
        <h4>教案概念圖</h4>
        <div style="margin-top: 16px; padding: 24px; background: var(--bg-tertiary); border-radius: 8px;">
            <div style="text-align: center; font-size: 18px; font-weight: bold; color: var(--primary-purple); margin-bottom: 24px;">
                教學主題
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                <div style="padding: 16px; background: var(--bg-secondary); border-radius: 8px; border: 2px solid var(--primary-purple-light);">
                    <strong>教學目標</strong>
                    <ul style="margin-top: 8px; font-size: 13px;">
                        <li>認知目標</li>
                        <li>技能目標</li>
                        <li>情意目標</li>
                    </ul>
                </div>
                <div style="padding: 16px; background: var(--bg-secondary); border-radius: 8px; border: 2px solid var(--accent-purple);">
                    <strong>教學活動</strong>
                    <ul style="margin-top: 8px; font-size: 13px;">
                        <li>引起動機</li>
                        <li>發展活動</li>
                        <li>綜合活動</li>
                    </ul>
                </div>
                <div style="padding: 16px; background: var(--bg-secondary); border-radius: 8px; border: 2px solid var(--secondary-teal);">
                    <strong>評量方式</strong>
                    <ul style="margin-top: 8px; font-size: 13px;">
                        <li>形成性評量</li>
                        <li>總結性評量</li>
                        <li>實作評量</li>
                    </ul>
                </div>
            </div>
        </div>
    `;
}

function generateReport() {
  const total = parseFloat(DOM.totalScore.textContent);
  return `
        <h4>教案評論報告</h4>
        <div style="margin-top: 16px; line-height: 1.8;">
            <div style="padding: 16px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 16px;">
                <strong>總體評分：</strong>
                <span style="font-size: 24px; color: var(--primary-purple); font-weight: bold;">
                    ${total || 0}/5.0
                </span>
            </div>
            
            <h5 style="color: var(--primary-purple); margin-top: 20px;">優點分析</h5>
            <ul style="margin-left: 20px;">
                <li>教學目標設定明確，符合課程標準</li>
                <li>內容組織完整，具有邏輯性</li>
                <li>教學活動設計豐富多元</li>
            </ul>
            
            <h5 style="color: var(--primary-purple); margin-top: 20px;">改進建議</h5>
            <ul style="margin-left: 20px;">
                <li>可增加更多學生互動環節</li>
                <li>建議融入更多實際案例</li>
                <li>評量方式可更加多元化</li>
            </ul>
            
            <h5 style="color: var(--primary-purple); margin-top: 20px;">具體建議</h5>
            <p>建議在教學活動中加入小組討論環節，讓學生能夠互相交流學習心得。同時可以考慮使用數位工具輔助教學，提升學生的學習興趣和參與度。</p>
        </div>
    `;
}

// === 對話框功能 ===
function showShareDialog() {
  DOM.modalTitle.textContent = "共享設定";
  DOM.modalBody.innerHTML = `
        <h4>共享此教案評論系統</h4>
        <div style="margin-top: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">共享連結</label>
            <div style="display: flex; gap: 8px;">
                <input type="text" value="https://lessonplan-review.app/share/abc123" 
                       style="flex: 1; padding: 12px; border: 1px solid var(--border-light); border-radius: 8px;" readonly>
                <button onclick="copyShareLink()" class="primary-btn" style="width: auto; padding: 12px 24px;">
                    複製
                </button>
            </div>
            <p style="margin-top: 16px; color: var(--text-secondary); font-size: 13px;">
                任何擁有此連結的人都可以查看您的教案評論內容
            </p>
        </div>
    `;
  DOM.modal.classList.remove("hidden");
}

function showSettingsDialog() {
  DOM.modalTitle.textContent = "系統設定";
  DOM.modalBody.innerHTML = `
        <h4>偏好設定</h4>
        <div style="margin-top: 16px;">
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">AI 回應風格</label>
                <select style="width: 100%; padding: 12px; border: 1px solid var(--border-light); border-radius: 8px;">
                    <option>專業詳細</option>
                    <option>簡潔扼要</option>
                    <option>友善親切</option>
                </select>
            </div>
            <div style="margin-bottom: 20px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" checked>
                    <span>自動儲存對話記錄</span>
                </label>
            </div>
            <div style="margin-bottom: 20px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" checked>
                    <span>顯示引用來源</span>
                </label>
            </div>
            <button onclick="saveSettings()" class="primary-btn">
                儲存設定
            </button>
        </div>
    `;
  DOM.modal.classList.remove("hidden");
}

function closeModal() {
  DOM.modal.classList.add("hidden");
}

function copyShareLink() {
  navigator.clipboard.writeText("https://lessonplan-review.app/share/abc123");
  showNotification("連結已複製");
}

function saveSettings() {
  showNotification("設定已儲存");
  closeModal();
}

// === 工具函數 ===
function getFileIcon(type) {
  if (type.includes("pdf")) return "picture_as_pdf";
  if (type.includes("word") || type.includes("document")) return "description";
  if (type.includes("text")) return "article";
  return "insert_drive_file";
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "剛剛";
  if (minutes < 60) return minutes + " 分鐘前";
  if (hours < 24) return hours + " 小時前";
  if (days < 7) return days + " 天前";

  return date.toLocaleDateString("zh-TW");
}

function showNotification(message, type = "success") {
  const notification = document.createElement("div");
  notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 24px;
        padding: 16px 24px;
        background: ${
          type === "success"
            ? "var(--secondary-teal)"
            : "var(--secondary-amber)"
        };
        color: white;
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "fadeOut 0.3s ease";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function setupAutoResize() {
  DOM.chatInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";
  });
}

function loadSampleData() {
  // 載入範例教案
  const sampleSources = [
    {
      id: 1,
      name: "數學教案-幾何圖形.pdf",
      type: "application/pdf",
      size: 1024 * 512,
      uploadDate: new Date(Date.now() - 86400000 * 2),
      selected: false,
    },
    {
      id: 2,
      name: "語文教案-閱讀理解.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 1024 * 256,
      uploadDate: new Date(Date.now() - 86400000),
      selected: false,
    },
  ];

  // AppState.sources = sampleSources;
  // sampleSources.forEach(source => addSourceToList(source));
}

// === 啟動應用 ===
document.addEventListener("DOMContentLoaded", init);

// === 全局函數（供 HTML onclick 使用）===
window.saveToNotes = saveToNotes;
window.copyMessage = copyMessage;
window.copyShareLink = copyShareLink;
window.saveSettings = saveSettings;
window.closeNoteDetail = function () {
  const noteDetail = document.querySelector(".note-detail");
  if (noteDetail) {
    noteDetail.remove();
  }
};
