const reviewResult = document.getElementById("reviewResult");
const regenerateBtn = document.getElementById("regenerateBtn");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const menuBtn = document.querySelector(".menu-btn");
const pageShell = document.querySelector(".page-shell");
const commentEditor = document.getElementById("commentEditor");
const commentEditorInput = document.getElementById("commentEditorInput");
const commentEditorCancel = document.getElementById("commentEditorCancel");
const commentEditorApply = document.getElementById("commentEditorApply");
const originalTextDisplay = document.getElementById("originalTextDisplay");
const commentEditorError = document.getElementById("commentEditorError");
const SIDEBAR_STATE_KEY = "lpr.sidebarCollapsed";
const EDITOR_GAP = 10;
const REVIEW_SESSION_KEY = "reviewSessionId";
const INITIAL_REVIEW_PROMPT =
  "請針對這份教案產生完整且正式的評論，包含總體評價、優點、缺點與具體修改建議。";
const REGENERATE_REVIEW_PROMPT =
  "請重新生成這份教案的正式評論，並更強調結構完整性、評量設計與可操作的改進建議。";

let activeSelectionRange = null;
let selectedOriginalText = "";
let reviewHistory = [];
let currentSessionId = sessionStorage.getItem(REVIEW_SESSION_KEY) || "";

function normalizeAssistantText(text) {
  return (
    String(text || "")
      .replace(/\r\n/g, "\n")
      // 移除 Markdown 標題符號（行首 #、##、### ...）
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .trim()
  );
}

function renderReviewParagraphs(bubble, text) {
  const normalized = normalizeAssistantText(text);

  // 依空行分段，單段內保留換行
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    bubble.textContent = "AI 未回傳評論內容。";
    return;
  }

  paragraphs.forEach((paragraph) => {
    const p = document.createElement("p");
    p.className = "review-paragraph";
    p.textContent = paragraph;
    bubble.appendChild(p);
  });
}

function createReviewBubble(content) {
  const bubble = document.createElement("article");
  bubble.className = "review-bubble";
  renderReviewParagraphs(bubble, content);
  reviewResult.appendChild(bubble);
  reviewResult.scrollTop = reviewResult.scrollHeight;
  return bubble;
}

function createUserBubble(content) {
  const bubble = document.createElement("div");
  bubble.className = "user-message";
  bubble.textContent = content;
  reviewResult.appendChild(bubble);
  reviewResult.scrollTop = reviewResult.scrollHeight;
  return bubble;
}

async function requestReview(message, options = {}) {
  const { clearExisting = false, showUserMessage = false } = options;
  const lessonId = window.LPR?.getCurrentLessonId();

  if (clearExisting) {
    reviewResult.innerHTML = "";
    reviewHistory = [];
    currentSessionId = "";
    sessionStorage.removeItem(REVIEW_SESSION_KEY);
  }

  if (!lessonId) {
    createReviewBubble("尚未選擇教案，請先返回上傳頁面完成教案上傳。");
    return;
  }

  if (showUserMessage) {
    createUserBubble(message);
  }

  const loadingBubble = createReviewBubble("AI 正在生成評論...");

  try {
    const data = await window.LPR.request("/chat", {
      method: "POST",
      body: {
        message,
        selectedSources: [parseFloat(lessonId)],
        chatHistory: reviewHistory,
        sessionId: currentSessionId || undefined,
      },
    });

    currentSessionId = data.sessionId || currentSessionId;
    if (currentSessionId) {
      sessionStorage.setItem(REVIEW_SESSION_KEY, currentSessionId);
    }

    loadingBubble.remove();
    createReviewBubble(data.content || "AI 未回傳評論內容。");

    reviewHistory.push({ role: "user", content: message });
    reviewHistory.push({ role: "assistant", content: data.content || "" });
  } catch (error) {
    loadingBubble.remove();
    createReviewBubble(`生成評論失敗：${error.message}`);
  }
}

function hideCommentEditor() {
  if (!commentEditor) {
    return;
  }
  commentEditor.hidden = true;
  activeSelectionRange = null;
  selectedOriginalText = "";
}

function isSelectionInsideAiReview(range) {
  if (!range) {
    return false;
  }
  const anchorNode = range.commonAncestorContainer;
  const anchorElement =
    anchorNode.nodeType === Node.ELEMENT_NODE
      ? anchorNode
      : anchorNode.parentElement;

  if (!anchorElement || !reviewResult.contains(anchorElement)) {
    return false;
  }

  return Boolean(anchorElement.closest(".review-bubble"));
}

function positionCommentEditor(rangeRect) {
  if (!commentEditor) {
    return;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isInLowerHalf = rangeRect.top > viewportHeight / 2;

  commentEditor.hidden = false;

  const panelRect = commentEditor.getBoundingClientRect();
  const panelWidth = panelRect.width;
  const panelHeight = panelRect.height;

  let left = rangeRect.left + (rangeRect.width - panelWidth) / 2;
  left = Math.max(12, Math.min(left, viewportWidth - panelWidth - 12));

  let top;
  if (isInLowerHalf) {
    top = rangeRect.top - panelHeight - EDITOR_GAP;
  } else {
    top = rangeRect.bottom + EDITOR_GAP;
  }

  top = Math.max(12, Math.min(top, viewportHeight - panelHeight - 12));

  commentEditor.style.left = `${left}px`;
  commentEditor.style.top = `${top}px`;
}

function handleReviewSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    hideCommentEditor();
    return;
  }

  const text = selection.toString().trim();
  if (!text) {
    hideCommentEditor();
    return;
  }

  const selectedRange = selection.getRangeAt(0);
  if (!isSelectionInsideAiReview(selectedRange)) {
    hideCommentEditor();
    return;
  }

  // 儲存選取範圍和原始文字
  activeSelectionRange = selectedRange.cloneRange();
  selectedOriginalText = text;

  // 顯示原始文字在編輯器中
  if (originalTextDisplay) {
    // 截斷過長的文字
    const displayText =
      text.length > 100 ? text.substring(0, 100) + "..." : text;
    originalTextDisplay.textContent = displayText;
  }

  // 清空輸入框，讓用戶輸入修改指示
  commentEditorInput.value = "";

  const rangeRect = selectedRange.getBoundingClientRect();
  positionCommentEditor(rangeRect);
}

function applySidebarState() {
  const isCollapsed = window.LPR
    ? window.LPR.getSidebarCollapsed()
    : localStorage.getItem(SIDEBAR_STATE_KEY) === "true";
  pageShell.classList.toggle("sidebar-collapsed", isCollapsed);
}

function persistSidebarState() {
  const isCollapsed = pageShell.classList.contains("sidebar-collapsed");
  if (window.LPR) {
    window.LPR.setSidebarCollapsed(isCollapsed);
    return;
  }

  localStorage.setItem(SIDEBAR_STATE_KEY, String(isCollapsed));
}

applySidebarState();

// 折疊側邊欄功能
menuBtn.addEventListener("click", () => {
  pageShell.classList.toggle("sidebar-collapsed");
  persistSidebarState();
});

// 頁面載入時自動生成首次評論
window.addEventListener("DOMContentLoaded", async () => {
  await requestReview(INITIAL_REVIEW_PROMPT, { clearExisting: true });
});

// 重新生成評論按鈕
regenerateBtn.addEventListener("click", async () => {
  hideCommentEditor();

  regenerateBtn.disabled = true;
  regenerateBtn.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> 生成中...';

  await requestReview(REGENERATE_REVIEW_PROMPT, { clearExisting: true });

  regenerateBtn.disabled = false;
  regenerateBtn.innerHTML =
    '<i class="fa-solid fa-rotate-right"></i> 重新生成評論';
});

// 送出訊息邏輯
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideCommentEditor();
  await sendMessage(chatInput.value);
  chatInput.value = "";
  chatInput.focus();
});

reviewResult.addEventListener("mouseup", () => {
  setTimeout(() => {
    handleReviewSelection();
  }, 0);
});

commentEditorCancel.addEventListener("click", () => {
  hideCommentEditor();
  window.getSelection()?.removeAllRanges();
});

// ============================================
// API 呼叫封裝函數
// ============================================

/**
 * 呼叫 AI 修改評論
 * @param {string} originalComment - 原始評論文字
 * @param {string} instruction - 修改指示
 * @returns {Promise<string>} 修改後的評論
 */
async function modifyCommentWithAI(originalComment, instruction) {
  const data = await window.LPR.request("/chat/modify-comment", {
    method: "POST",
    body: {
      originalComment,
      instruction,
    },
  });

  if (!data.success || !data.modifiedComment) {
    throw new Error("AI 回傳格式錯誤");
  }

  return data.modifiedComment;
}

/**
 * 設定按鈕載入狀態
 */
function setButtonLoading(button, isLoading) {
  if (isLoading) {
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 修改中...';
    button.classList.add("loading");
  } else {
    button.disabled = false;
    button.innerHTML =
      button.dataset.originalText ||
      '<i class="fa-solid fa-wand-magic-sparkles"></i> AI 修改';
    button.classList.remove("loading");
  }
}

/**
 * 顯示編輯器錯誤訊息
 */
function showEditorError(message) {
  if (commentEditorError) {
    commentEditorError.textContent = message;
    commentEditorError.hidden = false;
    setTimeout(() => {
      commentEditorError.hidden = true;
    }, 5000);
  } else {
    alert(message);
  }
}

// ============================================
// 修改評論按鈕事件
// ============================================

commentEditorApply.addEventListener("click", async () => {
  const instruction = commentEditorInput.value.trim();

  // 驗證輸入
  if (!instruction) {
    showEditorError("請輸入修改指示");
    return;
  }

  if (!selectedOriginalText || !activeSelectionRange) {
    showEditorError("請先選取要修改的評論");
    return;
  }

  // 設定 Loading 狀態
  setButtonLoading(commentEditorApply, true);
  commentEditorCancel.disabled = true;

  try {
    // 呼叫 AI API
    const modifiedComment = await modifyCommentWithAI(
      selectedOriginalText,
      instruction,
    );

    // 替換原始文字
    activeSelectionRange.deleteContents();
    activeSelectionRange.insertNode(document.createTextNode(modifiedComment));

    // 清除選取
    window.getSelection()?.removeAllRanges();

    // 關閉編輯器
    hideCommentEditor();
  } catch (error) {
    console.error("修改評論失敗:", error);
    showEditorError(`修改失敗：${error.message}`);
  } finally {
    // 恢復按鈕狀態
    setButtonLoading(commentEditorApply, false);
    commentEditorCancel.disabled = false;
  }
});

document.addEventListener("mousedown", (event) => {
  if (commentEditor.hidden) {
    return;
  }
  const clickTarget = event.target;
  const clickedEditor = commentEditor.contains(clickTarget);
  const clickedReview = reviewResult.contains(clickTarget);
  if (!clickedEditor && !clickedReview) {
    hideCommentEditor();
  }
});

async function sendMessage(text) {
  const message = text.trim();
  if (!message) {
    return;
  }

  await requestReview(message, { showUserMessage: true });
}
