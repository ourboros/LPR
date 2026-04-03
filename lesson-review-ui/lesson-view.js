const menuBtn = document.querySelector(".menu-btn");
const pageShell = document.querySelector(".page-shell");
const lessonFileName = document.getElementById("lessonFileName");
const lessonUploadDate = document.getElementById("lessonUploadDate");
const lessonText = document.getElementById("lessonText");
const deleteHistoryBtn = document.getElementById("deleteHistoryBtn");
const deletePreviewBox = document.getElementById("deletePreviewBox");
const deletePreviewSummary = document.getElementById("deletePreviewSummary");

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

async function loadLesson() {
  const lessonId = window.LPR.getCurrentLessonId();

  if (!lessonId) {
    lessonFileName.textContent = "尚未選擇教案";
    lessonUploadDate.textContent = "未提供";
    lessonText.innerHTML = "<p>尚未選擇教案。請先回到上傳頁面上傳教案。</p>";
    return;
  }

  try {
    const lesson = await window.LPR.request(`/upload/lesson/${lessonId}`);

    lessonFileName.textContent = lesson.name || "未命名教案";
    lessonUploadDate.textContent = window.LPR.formatDate(lesson.uploadDate);
    lessonText.textContent = lesson.content || "此教案沒有可顯示的內容。";
  } catch (error) {
    lessonFileName.textContent = "載入失敗";
    lessonUploadDate.textContent = "未提供";
    lessonText.innerHTML = `<p>載入教案內容失敗：${error.message}</p>`;
  }
}

async function deleteLessonWithHistory() {
  const lessonId = window.LPR.getCurrentLessonId();
  if (!lessonId) {
    return;
  }

  try {
    const preview = await window.LPR.request(
      `/upload/lesson/${lessonId}/delete-preview?scope=history`,
    );

    if (deletePreviewBox && deletePreviewSummary) {
      deletePreviewSummary.textContent = `將刪除教案 ${preview.lessonCount} 筆、評論 ${preview.reviewCount} 筆、評分 ${preview.scoreCount} 筆、檔案 ${preview.fileCount} 筆。`;
      deletePreviewBox.hidden = false;
    }

    const confirmed = window.confirm(
      "確認刪除這份教案及同群組的評論與評分紀錄嗎？此動作無法復原。",
    );

    if (!confirmed) {
      return;
    }

    await window.LPR.request(
      `/upload/lesson/${lessonId}?cascade=true&scope=history`,
      {
        method: "DELETE",
      },
    );

    window.LPR.clearCurrentLesson();
    sessionStorage.removeItem("chatSessionId");
    sessionStorage.removeItem("reviewSessionId");
    window.location.href = "./upload.html";
  } catch (error) {
    alert(`刪除失敗：${error.message}`);
  }
}

applySidebarState();

if (menuBtn && pageShell) {
  menuBtn.addEventListener("click", () => {
    pageShell.classList.toggle("sidebar-collapsed");
    persistSidebarState();
  });
}

if (deleteHistoryBtn) {
  deleteHistoryBtn.addEventListener("click", deleteLessonWithHistory);
}

document.addEventListener("DOMContentLoaded", loadLesson);
