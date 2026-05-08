const fileInput = document.getElementById("fileInput");
const uploadForm = document.getElementById("uploadForm");
const fileName = document.getElementById("fileName");
const uploadBtn = document.getElementById("uploadBtn");
const uploadStatus = document.getElementById("uploadStatus");
const duplicateModal = document.getElementById("duplicateModal");
const duplicateSummary = document.getElementById("duplicateSummary");
const duplicateList = document.getElementById("duplicateList");
const reuseHistoryBtn = document.getElementById("reuseHistoryBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

let selectedFile = null;
let pendingUploadResult = null;

function hideDuplicateModal() {
  if (!duplicateModal) {
    return;
  }

  duplicateModal.hidden = true;
}

function setStatus(message, type = "") {
  uploadStatus.textContent = message;
  uploadStatus.classList.remove("error", "success");

  if (type) {
    uploadStatus.classList.add(type);
  }
}

// 檔案選擇觸發
fileInput.addEventListener("change", (e) => {
  handleFileSelect(e.target.files[0]);
});

// 拖放上傳
uploadForm.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadForm.classList.add("drag-over");
});

uploadForm.addEventListener("dragleave", () => {
  uploadForm.classList.remove("drag-over");
});

uploadForm.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadForm.classList.remove("drag-over");
  handleFileSelect(e.dataTransfer.files[0]);
});

// 處理檔案選擇
function handleFileSelect(file) {
  if (!file) return;

  hideDuplicateModal();
  pendingUploadResult = null;

  const allowedTypes = [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "text/plain",
  ];

  if (!allowedTypes.includes(file.type)) {
    setStatus(
      "❌ 檔案格式不支持，請上傳 .doc, .docx, .pdf, .txt 格式",
      "error",
    );
    return;
  }

  selectedFile = file;
  fileName.textContent = `✓ 已選擇：${file.name}`;
  fileName.classList.add("show");
  uploadBtn.disabled = false;
  setStatus("");
}

// 上傳按鈕
uploadBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  hideDuplicateModal();
  pendingUploadResult = null;

  const formData = new FormData();
  formData.append("file", selectedFile);

  uploadBtn.disabled = true;
  setStatus("上傳中...");

  try {
    const result = await window.LPR.request("/upload", {
      method: "POST",
      body: formData,
    });

    if (result.duplicateDecisionRequired) {
      pendingUploadResult = result;
      showDuplicateModal(result);
      return;
    }

    finalizeUploadAndRedirect(result, "✓ 上傳成功！正在跳轉...");
  } catch (error) {
    uploadBtn.disabled = false;
    setStatus(`❌ 上傳失敗：${error.message}`, "error");
  }
});

function finalizeUploadAndRedirect(result, statusMessage) {
  window.LPR.setCurrentLesson({
    id: result.id,
    name: result.name,
  });
  sessionStorage.removeItem("chatSessionId");
  sessionStorage.removeItem("reviewSessionId");

  setStatus(statusMessage, "success");
  setTimeout(() => {
    window.location.href = "./lesson-review.html";
  }, 900);
}

function showDuplicateModal(result) {
  if (!duplicateModal) {
    return;
  }

  const historySummary = result.historySummary || {};
  duplicateSummary.textContent = `此教案可能與先前資料相同。歷史評論 ${historySummary.reviewCount || 0} 筆，歷史評分 ${historySummary.scoreCount || 0} 筆。`;
  duplicateList.innerHTML = "";

  const lessons = Array.isArray(result.matchedLessons)
    ? result.matchedLessons
    : [];
  lessons.slice(0, 5).forEach((lesson) => {
    const item = document.createElement("li");
    const dateText = window.LPR.formatDate(lesson.uploadDate);
    item.textContent = `${lesson.name || "未命名教案"}（上傳時間：${dateText}）`;
    duplicateList.appendChild(item);
  });

  duplicateModal.hidden = false;
}

function getReusableLessonFromDuplicateResult(result) {
  const candidateId = result?.targetLessonId;

  if (!Number.isFinite(Number(candidateId))) {
    return null;
  }

  return {
    id: candidateId,
    name: result?.targetLessonName || "未命名教案",
  };
}

async function resolveDuplicate(action) {
  if (!pendingUploadResult) {
    hideDuplicateModal();
    setStatus("未找到待處理的重複教案資料，請重新上傳。", "error");
    return;
  }

  reuseHistoryBtn.disabled = true;
  clearHistoryBtn.disabled = true;

  try {
    const data = await window.LPR.request("/upload/resolve-duplicate", {
      method: "POST",
      body: {
        newLessonId: pendingUploadResult.id,
        action,
      },
    });

    const targetLesson = getReusableLessonFromDuplicateResult(data);
    if (!targetLesson || data?.targetFound === false) {
      throw new Error(data?.message || "找不到可使用的教案資料，請重新上傳。");
    }

    hideDuplicateModal();

    const message =
      action === "clear-history"
        ? "✓ 已清除先前資料，正在進入系統..."
        : "✓ 已載入先前資料，正在進入系統...";

    finalizeUploadAndRedirect(targetLesson, `${message}`);

    if (data?.action === "clear-history") {
      sessionStorage.setItem("historyAction", "cleared");
    } else {
      sessionStorage.setItem("historyAction", "reused");
    }
  } catch (error) {
    setStatus(`❌ 重複資料處理失敗：${error.message}`, "error");
  } finally {
    reuseHistoryBtn.disabled = false;
    clearHistoryBtn.disabled = false;
  }
}

if (reuseHistoryBtn) {
  reuseHistoryBtn.addEventListener("click", () =>
    resolveDuplicate("reuse-history"),
  );
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener("click", () => {
    const confirmed = window.confirm(
      "確認要清除之前相同教案的評論與評分紀錄嗎？此動作無法復原。",
    );
    if (!confirmed) {
      return;
    }

    resolveDuplicate("clear-history");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  hideDuplicateModal();

  window.addEventListener("lpr:auth:success", (event) => {
    const userName = event.detail?.name || "使用者";
    setStatus(`✓ 已登入：${userName}`, "success");
  });

  window.addEventListener("lpr:auth:error", (event) => {
    const message = event.detail || "登入失敗，請稍後再試";
    setStatus(`❌ ${message}`, "error");
  });

  window.addEventListener("lpr:auth:logout", () => {
    setStatus("已登出", "success");
  });
});
