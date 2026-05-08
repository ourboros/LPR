const chatList = document.getElementById("chatList");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const quickButtons = document.querySelectorAll(".quick-btn");
const menuBtn = document.querySelector(".menu-btn");
const pageShell = document.querySelector(".page-shell");

const CHAT_SESSION_KEY = "chatSessionId";
let chatHistory = [];
let currentSessionId = sessionStorage.getItem(CHAT_SESSION_KEY) || "";

function applySidebarState() {
  if (!pageShell) {
    return;
  }

  pageShell.classList.toggle(
    "sidebar-collapsed",
    window.LPR.getSidebarCollapsed(),
  );
}

function persistSidebarState() {
  if (!pageShell) {
    return;
  }

  window.LPR.setSidebarCollapsed(
    pageShell.classList.contains("sidebar-collapsed"),
  );
}

function renderAssistantContent(bubble, text) {
  if (window.LPRMarkdown?.renderToContainer) {
    window.LPRMarkdown.renderToContainer(bubble, text, {
      className: "markdown-content",
      emptyText: "AI 未回傳內容",
    });
    return;
  }

  bubble.textContent = String(text || "").trim() || "AI 未回傳內容";
}

function appendBubble(text, role, isShort = false) {
  const bubble = document.createElement("article");
  bubble.className =
    role === "user" ? "bubble bubble-user" : "bubble bubble-ai";

  if (isShort && role === "user") {
    bubble.classList.add("short");
  }

  if (role === "assistant") {
    renderAssistantContent(bubble, text);
  } else {
    bubble.textContent = text;
  }

  chatList.appendChild(bubble);
  chatList.scrollTop = chatList.scrollHeight;
  return bubble;
}

function appendLoadingBubble() {
  const bubble = document.createElement("article");
  bubble.className = "bubble bubble-ai";
  bubble.textContent = "AI 分析中...";
  chatList.appendChild(bubble);
  chatList.scrollTop = chatList.scrollHeight;
  return bubble;
}

function appendSystemMessage(text) {
  const message = document.createElement("article");
  message.className = "bubble bubble-ai";
  message.textContent = text;
  chatList.appendChild(message);
}

async function callChatApi(message, options = {}) {
  const { mode = "chat-free", action = "free", maxChars } = options;

  const lessonId = window.LPR.getCurrentLessonId();

  if (!lessonId) {
    throw new Error("尚未選擇教案，請先回到上傳頁上傳教案");
  }

  if (mode === "quick-action" && action === "analyze") {
    return window.LPR.request("/chat/analyze", {
      method: "POST",
      body: {
        lessonId: parseFloat(lessonId),
        maxChars,
      },
    });
  }

  if (mode === "quick-action" && action === "suggest") {
    return window.LPR.request("/chat/suggest", {
      method: "POST",
      body: {
        lessonId: parseFloat(lessonId),
        maxChars,
      },
    });
  }

  if (mode === "quick-action" && action === "score") {
    return window.LPR.request("/chat/score", {
      method: "POST",
      body: {
        lessonId: parseFloat(lessonId),
        maxChars,
      },
    });
  }

  return window.LPR.request("/chat", {
    method: "POST",
    body: {
      message,
      selectedSources: [parseFloat(lessonId)],
      chatHistory,
      sessionId: currentSessionId || undefined,
      mode,
      action,
      maxChars,
    },
  });
}

async function requestAssistantReply(message, options = {}) {
  const {
    mode = "chat-free",
    action = "free",
    maxChars,
    showUser = true,
  } = options;

  if (!message) {
    return;
  }

  if (showUser) {
    appendBubble(message, "user", message.length <= 20);
  }

  const loadingBubble = appendLoadingBubble();

  try {
    const data = await callChatApi(message, {
      mode,
      action,
      maxChars,
    });
    currentSessionId = data.sessionId || currentSessionId;
    if (currentSessionId) {
      sessionStorage.setItem(CHAT_SESSION_KEY, currentSessionId);
    }

    loadingBubble.remove();
    appendBubble(data.content || "AI 未回傳內容", "assistant");

    chatHistory.push({ role: "user", content: message });
    chatHistory.push({ role: "assistant", content: data.content || "" });
  } catch (error) {
    loadingBubble.remove();
    appendBubble(`系統錯誤：${error.message}`, "assistant");
  }
}

function inferQuickAction(button) {
  const action = button?.dataset?.action;
  if (action) {
    return action;
  }

  const prompt = button?.dataset?.prompt || "";
  if (prompt === "請分析教案結構") {
    return "analyze";
  }

  if (prompt === "請提供改進建議") {
    return "suggest";
  }

  return "summary";
}

async function loadAndInjectHistoryChat() {
  const lessonId = window.LPR.getCurrentLessonId();
  if (!lessonId) {
    return false;
  }

  try {
    const data = await window.LPR.request(`/reviews/history/${lessonId}`);
    const reviews = Array.isArray(data.reviews) ? data.reviews : [];
    const chatReviews = reviews.filter((item) => item.mode !== "review-formal");

    if (chatReviews.length === 0) {
      return false;
    }

    const seedRecords = chatReviews.slice(0, 3).reverse();
    seedRecords.forEach((record) => {
      const prompt = String(record.userPrompt || "").trim();
      const answer = String(record.aiContent || "").trim();

      if (prompt) {
        appendBubble(prompt, "user", prompt.length <= 20);
        chatHistory.push({ role: "user", content: prompt });
      }

      if (answer) {
        appendBubble(answer, "assistant");
        chatHistory.push({ role: "assistant", content: answer });
      }
    });

    appendSystemMessage("已載入先前對話紀錄，可直接延續討論。");
    return chatHistory.length > 0;
  } catch (error) {
    console.error("載入歷史對話失敗:", error);
    return false;
  }
}

applySidebarState();

if (menuBtn && pageShell) {
  menuBtn.addEventListener("click", () => {
    pageShell.classList.toggle("sidebar-collapsed");
    persistSidebarState();
  });
}

if (chatForm && chatInput) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = chatInput.value.trim();
    chatInput.value = "";
    chatInput.focus();
    await requestAssistantReply(message, {
      mode: "chat-free",
      action: "free",
    });
  });
}

if (chatInput && quickButtons.length > 0) {
  quickButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const prompt = button.dataset.prompt || "";
      const action = inferQuickAction(button);
      await requestAssistantReply(prompt, {
        mode: "quick-action",
        action,
        maxChars: 300,
      });
      chatInput.focus();
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const currentLessonName = window.LPR.getCurrentLessonName();

  if (!window.LPR.getCurrentLessonId()) {
    appendSystemMessage(
      "尚未選擇教案。請先回到上傳頁面上傳教案，再開始 AI 分析。",
    );
    return;
  }

  if (currentLessonName) {
    appendSystemMessage(`目前分析教案：${currentLessonName}`);
  }

  const hasHistory = await loadAndInjectHistoryChat();

  if (!hasHistory) {
    try {
      // ✅ 改進：添加錯誤處理，避免初始化失敗導致頁面崩潰
      await requestAssistantReply("請生成教案摘要", {
        showUser: false,
        mode: "summary",
        action: "summary",
        maxChars: 500,
      });
    } catch (error) {
      console.error("[初始化] 生成摘要失敗，允許用戶手動操作:", error);
      appendSystemMessage(
        "AI 摘要生成失敗，您可手動提問或點擊下方快速按鈕重新嘗試。",
      );
    }
  }
});
