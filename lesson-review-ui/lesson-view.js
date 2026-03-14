const menuBtn = document.querySelector(".menu-btn");
const pageShell = document.querySelector(".page-shell");
const lessonFileName = document.getElementById("lessonFileName");
const lessonUploadDate = document.getElementById("lessonUploadDate");
const lessonText = document.getElementById("lessonText");

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

applySidebarState();

if (menuBtn && pageShell) {
  menuBtn.addEventListener("click", () => {
    pageShell.classList.toggle("sidebar-collapsed");
    persistSidebarState();
  });
}

document.addEventListener("DOMContentLoaded", loadLesson);
