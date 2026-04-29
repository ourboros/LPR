const reviewResult = document.getElementById("reviewResult");
const regenerateBtn = document.getElementById("regenerateBtn");
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
const REVIEW_SESSION_LEGACY_KEY = "lpr.reviewSessionId";
const SIDEBAR_STATE_LEGACY_KEY = "lpr.sidebarCollapsed";

let activeSelectionRange = null;
let selectedOriginalText = "";
let selectedReviewId = null;
let selectedReviewBubble = null;
let selectedFullComment = "";
let selectedRangeStart = -1;
let selectedRangeEnd = -1;
let selectedPlainContextBefore = "";
let selectedPlainContextAfter = "";
let selectedPlainTextSnapshot = "";
let reviewHistory = [];
let currentSessionId = "";
let isGenerating = false;
let lastLoadedLessonId = null;
const CONTEXT_WINDOW = 64;

function getSessionValue(primaryKey, legacyKey) {
  return window.LPR?.getSessionValue?.(primaryKey, legacyKey) || "";
}

function setSessionValue(primaryKey, legacyKey, value) {
  window.LPR?.setSessionValue?.(primaryKey, legacyKey, value);
}

function removeSessionValue(primaryKey, legacyKey) {
  window.LPR?.removeSessionValue?.(primaryKey, legacyKey);
}

function getLocalValue(primaryKey, legacyKey) {
  return window.LPR?.getLocalValue?.(primaryKey, legacyKey) || "";
}

function setLocalValue(primaryKey, legacyKey, value) {
  window.LPR?.setLocalValue?.(primaryKey, legacyKey, value);
}

function getReviewSessionId() {
  return getSessionValue(REVIEW_SESSION_KEY, REVIEW_SESSION_LEGACY_KEY);
}

function setReviewSessionId(value) {
  currentSessionId = value ? String(value) : "";
  setSessionValue(
    REVIEW_SESSION_KEY,
    REVIEW_SESSION_LEGACY_KEY,
    currentSessionId,
  );
}

function clearReviewSessionId() {
  currentSessionId = "";
  removeSessionValue(REVIEW_SESSION_KEY, REVIEW_SESSION_LEGACY_KEY);
}

function getSidebarCollapsedState() {
  return window.LPR
    ? window.LPR.getSidebarCollapsed()
    : getLocalValue(SIDEBAR_STATE_KEY, SIDEBAR_STATE_LEGACY_KEY) === "true";
}

function setSidebarCollapsedState(isCollapsed) {
  if (window.LPR?.setSidebarCollapsed) {
    window.LPR.setSidebarCollapsed(isCollapsed);
    return;
  }

  setLocalValue(
    SIDEBAR_STATE_KEY,
    SIDEBAR_STATE_LEGACY_KEY,
    String(Boolean(isCollapsed)),
  );
}

function resolveSelectedReviewBubble() {
  if (selectedReviewBubble && selectedReviewBubble.isConnected) {
    return selectedReviewBubble;
  }

  if (!selectedReviewId) {
    return null;
  }

  return reviewResult.querySelector(
    `.review-bubble[data-review-id="${selectedReviewId}"]`,
  );
}

function refreshSelectedReviewContext() {
  const reviewBubble = resolveSelectedReviewBubble();
  if (!reviewBubble) {
    return false;
  }

  selectedReviewBubble = reviewBubble;
  selectedReviewId = reviewBubble.dataset.reviewId || selectedReviewId;
  selectedFullComment = String(reviewBubble.dataset.rawMarkdown || "").trim();

  if (!selectedFullComment) {
    selectedFullComment = String(reviewBubble.textContent || "").trim();
  }

  return Boolean(selectedReviewId && selectedFullComment);
}

function buildEditorErrorMessage(error) {
  if (typeof error === "string") {
    return error;
  }

  if (!error) {
    return "修改失敗，請稍後再試。";
  }

  const parts = [];
  if (error.message) {
    parts.push(error.message);
  }
  if (error.code) {
    parts.push(`代碼：${error.code}`);
  }
  if (error.hint) {
    parts.push(`提示：${error.hint}`);
  }

  const details = error.details || {};
  if (typeof details.candidateCount === "number") {
    parts.push(`候選數量：${details.candidateCount}`);
  }
  if (typeof details.method === "string" && details.method) {
    parts.push(`定位方式：${details.method}`);
  }

  return parts.length > 0 ? parts.join("\n") : "修改失敗，請稍後再試。";
}

currentSessionId = getReviewSessionId();

function getRangeOffsetsWithinElement(element, range) {
  if (!element || !range) {
    return { start: -1, end: -1 };
  }

  const startRange = range.cloneRange();
  startRange.selectNodeContents(element);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(element);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  };
}

function getSelectionContext(
  plainText,
  start,
  end,
  windowSize = CONTEXT_WINDOW,
) {
  const text = String(plainText || "");
  if (start < 0 || end <= start || start > text.length) {
    return { before: "", after: "" };
  }

  const before = text.slice(Math.max(0, start - windowSize), start);
  const after = text.slice(end, Math.min(text.length, end + windowSize));

  return {
    before,
    after,
  };
}

function setGenerationState(generating, options = {}) {
  const { showRegenerate = false } = options;
  isGenerating = generating;

  if (!regenerateBtn) {
    return;
  }

  if (showRegenerate) {
    regenerateBtn.hidden = false;
  }

  regenerateBtn.disabled = generating || regenerateBtn.hidden;
}

function renderReviewContent(bubble, text) {
  if (window.LPRMarkdown?.renderToContainer) {
    window.LPRMarkdown.renderToContainer(bubble, text, {
      className: "markdown-content",
      emptyText: "AI 未回傳評論內容。",
    });
    return;
  }

  bubble.textContent = String(text || "").trim() || "AI 未回傳評論內容。";
}

function createReviewBubble(content, reviewId = null) {
  const bubble = document.createElement("article");
  bubble.className = "review-bubble";
  if (reviewId !== null && reviewId !== undefined) {
    bubble.dataset.reviewId = String(reviewId);
  }
  bubble.dataset.rawMarkdown = String(content || "").trim();
  renderReviewContent(bubble, content);
  reviewResult.appendChild(bubble);
  reviewResult.scrollTop = reviewResult.scrollHeight;
  return bubble;
}

async function requestReview(message, options = {}) {
  const { clearExisting = false } = options;
  const lessonId = window.LPR?.getCurrentLessonId();

  if (isGenerating) {
    return;
  }

  if (clearExisting) {
    reviewResult.innerHTML = "";
    reviewHistory = [];
    clearReviewSessionId();
  }

  if (!lessonId) {
    createReviewBubble("尚未選擇教案，請先返回上傳頁面完成教案上傳。");
    return;
  }

  setGenerationState(true);
  const loadingBubble = createReviewBubble("AI 正在生成評論...");

  try {
    const data = await window.LPR.request("/chat", {
      method: "POST",
      body: {
        message,
        selectedSources: [parseFloat(lessonId)],
        chatHistory: reviewHistory,
        sessionId: currentSessionId || undefined,
        mode: "review-formal",
        action: "review-formal",
      },
    });

    currentSessionId = data.sessionId || currentSessionId;
    if (currentSessionId) {
      setReviewSessionId(currentSessionId);
    }

    const savedReviewId = data.reviewId || null;
    const reviewContent = String(data.content || "").trim();

    if (!savedReviewId) {
      throw new Error("正式評論尚未成功建立可編輯紀錄，請重新生成");
    }

    if (!reviewContent) {
      throw new Error("AI 未回傳評論內容");
    }

    createReviewBubble(reviewContent, savedReviewId);

    reviewHistory.push({
      role: "user",
      content: message,
      reviewId: savedReviewId,
    });
    reviewHistory.push({
      role: "assistant",
      content: reviewContent,
      reviewId: savedReviewId,
    });
  } catch (error) {
    createReviewBubble(`生成評論失敗：${error.message}`);
  } finally {
    loadingBubble.remove();
    setGenerationState(false, { showRegenerate: true });
  }
}

async function loadAndInjectFormalReviewHistory() {
  const lessonId = window.LPR?.getCurrentLessonId();
  if (!lessonId) {
    return false;
  }

  // 檢查 lessonId 是否變化，若變化則清空舊資料
  if (lastLoadedLessonId && lastLoadedLessonId !== lessonId) {
    reviewResult.innerHTML = "";
    reviewHistory = [];
    clearReviewSessionId();
  }

  // 檢查 DOM 是否已有內容，若有則不重複加載（同一個教案）
  if (reviewResult.children.length > 0) {
    return reviewHistory.length > 0;
  }

  try {
    const data = await window.LPR.request(`/reviews/history/${lessonId}`);
    const records = (data.reviews || []).filter(
      (item) => item.mode === "review-formal",
    );

    if (records.length === 0) {
      return false;
    }

    const seedRecords = records.slice(0, 2).reverse();
    seedRecords.forEach((item) => {
      const prompt = String(item.userPrompt || "").trim();
      const content = String(item.aiContent || "").trim();

      if (prompt) {
        reviewHistory.push({
          role: "user",
          content: prompt,
          reviewId: item.reviewId,
        });
      }

      if (content) {
        createReviewBubble(content, item.reviewId);
        reviewHistory.push({
          role: "assistant",
          content,
          reviewId: item.reviewId,
        });
      }
    });

    createReviewBubble("已載入先前正式評論，可直接繼續調整。");

    // 記錄已加載的 lessonId
    lastLoadedLessonId = lessonId;

    return reviewHistory.length > 0;
  } catch (error) {
    console.error("載入歷史正式評論失敗:", error);
    return false;
  }
}

function hideCommentEditor() {
  if (!commentEditor) {
    return;
  }
  commentEditor.hidden = true;
  activeSelectionRange = null;
  selectedOriginalText = "";
  selectedReviewId = null;
  selectedReviewBubble = null;
  selectedFullComment = "";
  selectedRangeStart = -1;
  selectedRangeEnd = -1;
  selectedPlainContextBefore = "";
  selectedPlainContextAfter = "";
  selectedPlainTextSnapshot = "";
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

  return Boolean(anchorElement.closest(".review-bubble[data-review-id]"));
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

  const rawText = selection.toString();
  const text = rawText.trim();
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
  selectedOriginalText = rawText;

  const anchorNode = selectedRange.commonAncestorContainer;
  const anchorElement =
    anchorNode.nodeType === Node.ELEMENT_NODE
      ? anchorNode
      : anchorNode.parentElement;
  const reviewBubble = anchorElement?.closest(".review-bubble");
  selectedReviewBubble = reviewBubble;
  selectedReviewId = reviewBubble?.dataset.reviewId || null;

  const fullComment = String(reviewBubble?.dataset.rawMarkdown || "").trim();
  selectedFullComment = fullComment;

  const offsets = getRangeOffsetsWithinElement(reviewBubble, selectedRange);
  selectedRangeStart = offsets.start;
  selectedRangeEnd = offsets.end;

  const plainSnapshot = String(reviewBubble?.textContent || "");
  selectedPlainTextSnapshot = plainSnapshot;

  const selectionContext = getSelectionContext(
    plainSnapshot,
    selectedRangeStart,
    selectedRangeEnd,
  );
  selectedPlainContextBefore = selectionContext.before;
  selectedPlainContextAfter = selectionContext.after;

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
  const isCollapsed = getSidebarCollapsedState();
  pageShell.classList.toggle("sidebar-collapsed", isCollapsed);
}

function persistSidebarState() {
  const isCollapsed = pageShell.classList.contains("sidebar-collapsed");
  setSidebarCollapsedState(isCollapsed);
}

applySidebarState();
setGenerationState(false);

if (regenerateBtn) {
  regenerateBtn.hidden = true;
  regenerateBtn.disabled = true;
}

// 折疊側邊欄功能
menuBtn.addEventListener("click", () => {
  pageShell.classList.toggle("sidebar-collapsed");
  persistSidebarState();
});

// 頁面載入時自動生成首次評論
window.addEventListener("DOMContentLoaded", async () => {
  const hasHistory = await loadAndInjectFormalReviewHistory();
  if (!hasHistory) {
    await requestReview(INITIAL_REVIEW_PROMPT, { clearExisting: true });
    return;
  }

  setGenerationState(false, { showRegenerate: true });
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
async function modifyCommentWithAI(payload) {
  const {
    fullComment,
    selectedText,
    selectionStart,
    selectionEnd,
    plainContextBefore,
    plainContextAfter,
    plainSnapshot,
    instruction,
  } = payload;
  const lessonId = window.LPR?.getCurrentLessonId();
  const data = await window.LPR.request("/chat/modify-comment", {
    method: "POST",
    body: {
      originalComment: selectedText,
      fullComment,
      selectedText,
      selectionStart,
      selectionEnd,
      plainContextBefore,
      plainContextAfter,
      plainSnapshot,
      instruction,
      lessonId: lessonId ? parseFloat(lessonId) : undefined,
      reviewId: selectedReviewId ? parseInt(selectedReviewId, 10) : undefined,
    },
  });

  const nextFullComment = String(
    data.fullComment || data.modifiedComment || "",
  ).trim();
  if (!data.success || !nextFullComment) {
    throw new Error("AI 回傳格式錯誤");
  }

  return {
    fullComment: nextFullComment,
    reviewId: data.reviewId || selectedReviewId,
  };
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
  const displayMessage = buildEditorErrorMessage(message);

  if (commentEditorError) {
    commentEditorError.textContent = displayMessage;
    commentEditorError.hidden = false;
    setTimeout(() => {
      commentEditorError.hidden = true;
    }, 5000);
  } else {
    alert(displayMessage);
  }
}

/**
 * 查找兩個文本間的修改範圍
 * 返回 { prefixLen, modifiedText, suffixLen }
 */
function findModificationRange(oldText, newText) {
  const oldStr = String(oldText || "");
  const newStr = String(newText || "");

  // 找第一個不同的位置
  let prefixLen = 0;
  const minLen = Math.min(oldStr.length, newStr.length);

  while (prefixLen < minLen && oldStr[prefixLen] === newStr[prefixLen]) {
    prefixLen++;
  }

  // 找最後一個不同的位置
  let oldSuffixLen = 0;
  let newSuffixLen = 0;
  let oldIdx = oldStr.length - 1;
  let newIdx = newStr.length - 1;

  while (
    oldIdx >= prefixLen &&
    newIdx >= prefixLen &&
    oldStr[oldIdx] === newStr[newIdx]
  ) {
    oldIdx--;
    newIdx--;
    oldSuffixLen++;
    newSuffixLen++;
  }

  // 提取修改部分
  const modifiedStart = prefixLen;
  const modifiedEnd = newStr.length - newSuffixLen;
  const modifiedText = newStr.substring(modifiedStart, modifiedEnd);

  return {
    prefixLen,
    modifiedStart,
    modifiedEnd,
    modifiedText,
    oldSuffixLen,
    newSuffixLen,
  };
}

/**
 * 在 DOM 元素中查找並標記包含指定文本的節點
 * 直接操作 DOM 而不是使用 innerHTML，確保 mark 標籤被正確保留
 */
function markTextInDOM(element, textToMark) {
  if (!textToMark || textToMark.trim() === "") {
    return;
  }

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );

  const nodesToProcess = [];
  let node;

  // 第一遍：收集需要處理的節點
  while ((node = walker.nextNode())) {
    if (node.textContent.includes(textToMark)) {
      nodesToProcess.push(node);
    }
  }

  // 第二遍：在 DOM 中直接操作（避免使用 innerHTML）
  nodesToProcess.forEach((textNode) => {
    const fullText = textNode.textContent;
    const index = fullText.indexOf(textToMark);

    if (index === -1) {
      return; // 文本不存在
    }

    // 分割文本為三部分：前、中、後
    const beforeText = fullText.substring(0, index);
    const markedText = textToMark;
    const afterText = fullText.substring(index + textToMark.length);

    // 創建新的 DOM 節點結構
    const fragment = document.createDocumentFragment();

    // 添加前部分（如果存在）
    if (beforeText) {
      fragment.appendChild(document.createTextNode(beforeText));
    }

    // 創建 mark 元素並添加中間部分
    const markElement = document.createElement("mark");
    markElement.className = "text-modified";
    markElement.textContent = markedText;
    fragment.appendChild(markElement);

    // 添加後部分（如果存在）
    if (afterText) {
      fragment.appendChild(document.createTextNode(afterText));
    }

    // 替換原始文本節點
    textNode.parentElement.replaceChild(fragment, textNode);
  });
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

  if (!refreshSelectedReviewContext()) {
    showEditorError("找不到對應的評論紀錄，請重新選取後再試一次");
    return;
  }

  if (
    !selectedFullComment ||
    selectedRangeStart < 0 ||
    selectedRangeEnd <= selectedRangeStart
  ) {
    showEditorError("無法取得完整評論與選取範圍，請重新選取後再試一次");
    return;
  }

  // 設定 Loading 狀態
  setButtonLoading(commentEditorApply, true);
  commentEditorCancel.disabled = true;

  try {
    // 呼叫 AI API
    const modifyResult = await modifyCommentWithAI({
      fullComment: selectedFullComment,
      selectedText: selectedOriginalText,
      selectionStart: selectedRangeStart,
      selectionEnd: selectedRangeEnd,
      plainContextBefore: selectedPlainContextBefore,
      plainContextAfter: selectedPlainContextAfter,
      plainSnapshot: selectedPlainTextSnapshot,
      instruction,
    });

    const fullComment = modifyResult.fullComment;
    const responseReviewId = String(modifyResult.reviewId || selectedReviewId);

    // 儲存舊文本用於標記修改
    const oldMarkdown = selectedFullComment;
    const newMarkdown = fullComment;

    selectedReviewBubble.dataset.rawMarkdown = fullComment;

    // 先進行 markdown 渲染（不標記），然後在 DOM 中查找並標記
    if (window.LPRMarkdown?.renderToContainer) {
      // 使用新內容進行 markdown 渲染
      window.LPRMarkdown.renderToContainer(selectedReviewBubble, newMarkdown, {
        className: "markdown-content",
        emptyText: "AI 未回傳評論內容。",
      });

      // 渲染完成後，在 DOM 中查找並標記修改部分
      // 計算修改範圍
      const modRange = findModificationRange(oldMarkdown, newMarkdown);
      if (modRange.modifiedText && modRange.modifiedText.trim() !== "") {
        // 在 DOM 中標記修改的文本
        markTextInDOM(selectedReviewBubble, modRange.modifiedText);
      }
    } else {
      // 如果沒有 markdown 渲染器，直接設置清潔版本
      selectedReviewBubble.innerHTML = DOMPurify.sanitize(newMarkdown);
    }

    reviewHistory = reviewHistory.filter(
      (item) =>
        !(String(item.reviewId) === responseReviewId && item.role === "user"),
    );

    const historyIndex = reviewHistory.findIndex(
      (item) =>
        String(item.reviewId) === responseReviewId && item.role === "assistant",
    );

    if (historyIndex >= 0) {
      reviewHistory[historyIndex].content = fullComment;
    } else {
      reviewHistory.push({
        role: "assistant",
        content: fullComment,
        reviewId: responseReviewId,
      });
    }

    // 改為 scrollIntoView，讓修改的評論進入視圖，而不是跳到底部
    selectedReviewBubble.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });

    // 清除選取
    window.getSelection()?.removeAllRanges();

    // 關閉編輯器
    hideCommentEditor();
  } catch (error) {
    console.error("修改評論失敗:", error);
    showEditorError(error);
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
