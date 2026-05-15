(function initializeLessonSharedActions() {
  function navigateToUpload() {
    window.location.href = "./upload.html";
  }

  function resolveActiveLessonId() {
    const rawLessonId = window.LPR?.getCurrentLessonId?.();
    const parsedLessonId = Number(rawLessonId);
    if (!rawLessonId || !Number.isFinite(parsedLessonId)) {
      return "";
    }
    return String(rawLessonId);
  }

  function extractErrorMessage(error) {
    if (typeof error?.message === "string" && error.message.trim()) {
      return error.message;
    }
    if (typeof error === "string" && error.trim()) {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch (stringifyError) {
      return "未知錯誤";
    }
  }

  async function handleReupload(event) {
    event.preventDefault();

    const targetButton = event.currentTarget;
    if (!targetButton || targetButton.disabled) {
      return;
    }

    // 加入確認對話框
    const confirmed = window.confirm(
      "現有的評論紀錄仍然保留。確定要重新上傳教案嗎？",
    );

    if (!confirmed) {
      return;
    }

    navigateToUpload();
  }

  async function handleDeleteHistory(event) {
    event.preventDefault();

    const targetButton = event.currentTarget;
    if (!targetButton || targetButton.disabled) {
      return;
    }

    const lessonId = resolveActiveLessonId();
    if (!lessonId) {
      navigateToUpload();
      return;
    }

    targetButton.disabled = true;

    try {
      const preview = await window.LPR.request(
        `/upload/lesson/${lessonId}/delete-preview?scope=history`,
      );
      const summary = `將刪除教案 ${preview.lessonCount} 筆、評論 ${preview.reviewCount} 筆、評分 ${preview.scoreCount} 筆、檔案 ${preview.fileCount} 筆。`;
      const confirmed = window.confirm(
        `${summary}\n\n確認刪除這份教案及同群組的評論與評分紀錄嗎？此動作無法復原。`,
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
      window.LPR?.removeSessionValue?.("chatSessionId", "lpr.chatSessionId");
      window.LPR?.removeSessionValue?.(
        "reviewSessionId",
        "lpr.reviewSessionId",
      );
      navigateToUpload();
    } catch (error) {
      alert(`刪除失敗：${extractErrorMessage(error)}`);
    } finally {
      targetButton.disabled = false;
    }
  }

  function bindSharedNavActions() {
    document
      .querySelectorAll('[data-nav-action="reupload"]')
      .forEach((button) => {
        if (button.dataset.boundReupload === "true") {
          return;
        }

        button.addEventListener("click", handleReupload);
        button.dataset.boundReupload = "true";
      });

    document
      .querySelectorAll('[data-nav-action="delete-history"]')
      .forEach((button) => {
        if (button.dataset.boundDeleteHistory === "true") {
          return;
        }

        button.addEventListener("click", handleDeleteHistory);
        button.dataset.boundDeleteHistory = "true";
      });

    // 全域匯出按鈕事件處理
    const globalExportBtn = document.getElementById("globalExportBtn");
    if (globalExportBtn && !globalExportBtn.dataset.boundGlobalExport) {
      globalExportBtn.addEventListener("click", async () => {
        globalExportBtn.disabled = true;
        globalExportBtn.textContent = "匯出中...";

        try {
          const lessonId = window.LPR?.getCurrentLessonId();
          const lessonName = window.LPR?.getCurrentLessonName() || "教案";

          if (!lessonId) {
            alert("尚未選擇教案，請先回到上傳頁上傳教案");
            return;
          }

          await window.PDFExporter.exportAll(lessonName);
        } catch (error) {
          console.error("全域匯出失敗:", error);
          alert("匯出失敗，請稍後重試");
        } finally {
          globalExportBtn.disabled = false;
          globalExportBtn.textContent = "匯出報告";
          globalExportBtn.dataset.boundGlobalExport = "true";
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindSharedNavActions);
    return;
  }

  bindSharedNavActions();
})();
