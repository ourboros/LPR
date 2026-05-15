// ============================================
// 紀錄教案評分頁面 JavaScript
// ============================================

const menuBtn = document.querySelector(".menu-btn");
const pageShell = document.querySelector(".page-shell");
const totalScoreValue = document.getElementById("totalScoreValue");
const scoreComment = document.getElementById("scoreComment");
const resetBtn = document.getElementById("resetBtn");
const saveBtn = document.getElementById("saveBtn");

const SIDEBAR_STATE_KEY = "lpr.sidebarCollapsed";
const CURRENT_LESSON_KEY = "lpr.currentLessonId";
const LEGACY_CURRENT_LESSON_KEY = "currentLessonId";

// 評分維度對應
const DIMENSIONS = [
  "structure",
  "objectives",
  "activities",
  "methods",
  "assessment",
];

// 儲存各維度評分
const scores = {
  structure: 0,
  objectives: 0,
  activities: 0,
  methods: 0,
  assessment: 0,
};

// ============================================
// 側邊欄狀態管理
// ============================================

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

menuBtn.addEventListener("click", () => {
  pageShell.classList.toggle("sidebar-collapsed");
  persistSidebarState();
});

// ============================================
// 星級評分互動
// ============================================

/**
 * 更新星星顯示
 * @param {Element} starRating - 星級評分容器
 * @param {number} value - 評分值 (1-5)
 */
function updateStars(starRating, value) {
  const stars = starRating.querySelectorAll("i");
  stars.forEach((star, index) => {
    if (index < value) {
      star.classList.remove("fa-regular");
      star.classList.add("fa-solid");
    } else {
      star.classList.remove("fa-solid");
      star.classList.add("fa-regular");
    }
  });
  starRating.dataset.value = value;
}

/**
 * 初始化星級評分互動
 */
function initStarRatings() {
  const ratingItems = document.querySelectorAll(".rating-item");

  ratingItems.forEach((item) => {
    const dimension = item.dataset.dimension;
    const starRating = item.querySelector(".star-rating");
    const stars = starRating.querySelectorAll("i");

    // Hover 效果
    stars.forEach((star) => {
      star.addEventListener("mouseenter", () => {
        const hoverValue = parseInt(star.dataset.star);
        stars.forEach((s, index) => {
          if (index < hoverValue) {
            s.classList.add("hover");
          } else {
            s.classList.remove("hover");
          }
        });
      });
    });

    // 移出時恢復原狀
    starRating.addEventListener("mouseleave", () => {
      stars.forEach((s) => s.classList.remove("hover"));
    });

    // 點擊設定評分
    stars.forEach((star) => {
      star.addEventListener("click", () => {
        const value = parseInt(star.dataset.star);
        scores[dimension] = value;
        updateStars(starRating, value);
        updateTotalScore();
      });
    });
  });
}

// ============================================
// 總分計算
// ============================================

/**
 * 計算並更新總體評分
 */
function updateTotalScore() {
  const values = Object.values(scores);
  const ratedCount = values.filter((v) => v > 0).length;

  if (ratedCount === 0) {
    totalScoreValue.textContent = "0.0/5.0";
    return;
  }

  const sum = values.reduce((acc, val) => acc + val, 0);
  const average = sum / DIMENSIONS.length;
  const rounded = Math.round(average * 10) / 10;

  totalScoreValue.textContent = `${rounded.toFixed(1)}/5.0`;
}

// ============================================
// 重置功能
// ============================================

function resetAllScores() {
  // 重置評分數據
  DIMENSIONS.forEach((dim) => {
    scores[dim] = 0;
  });

  // 重置星星顯示
  document.querySelectorAll(".star-rating").forEach((starRating) => {
    updateStars(starRating, 0);
  });

  // 重置總分
  updateTotalScore();

  // 清空評論
  scoreComment.value = "";

  showToast("評分已重置", "success");
}

// ============================================
// 儲存功能
// ============================================

/**
 * 設定按鈕載入狀態
 */
function setButtonLoading(button, isLoading) {
  if (isLoading) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 儲存中...';
    button.classList.add("loading");
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || "儲存評分";
    button.classList.remove("loading");
  }
}

/**
 * 儲存評分到後端
 */
async function saveScores() {
  // 檢查是否有評分
  const hasRating = Object.values(scores).some((v) => v > 0);
  if (!hasRating) {
    showToast("請至少完成一項評分", "error");
    return;
  }

  // 取得當前教案 ID
  const lessonId =
    (window.LPR && window.LPR.getCurrentLessonId()) ||
    localStorage.getItem(CURRENT_LESSON_KEY) ||
    localStorage.getItem(LEGACY_CURRENT_LESSON_KEY) ||
    Date.now();

  // 計算總分
  const sum = Object.values(scores).reduce((acc, val) => acc + val, 0);
  const total = Math.round((sum / DIMENSIONS.length) * 10) / 10;

  setButtonLoading(saveBtn, true);
  resetBtn.disabled = true;

  try {
    const data = await window.LPR.request("/scores", {
      method: "POST",
      body: {
        lessonId: parseFloat(lessonId),
        scores: scores,
        total: total,
        comment: scoreComment.value.trim(),
      },
    });

    if (data.success) {
      showToast("評分已成功儲存！", "success");
    } else {
      throw new Error("儲存失敗");
    }
  } catch (error) {
    console.error("儲存評分失敗:", error);
    showToast(`儲存失敗：${error.message}`, "error");
  } finally {
    setButtonLoading(saveBtn, false);
    resetBtn.disabled = false;
  }
}

// ============================================
// 載入已保存評分
// ============================================

/**
 * 載入指定教案的評分記錄
 */
async function loadExistingScores() {
  const lessonId =
    (window.LPR && window.LPR.getCurrentLessonId()) ||
    localStorage.getItem(CURRENT_LESSON_KEY) ||
    localStorage.getItem(LEGACY_CURRENT_LESSON_KEY);
  if (!lessonId) {
    return false;
  }

  try {
    const scoreRecords = await window.LPR.request(`/scores/lesson/${lessonId}`);

    if (scoreRecords && scoreRecords.length > 0) {
      // 載入最新的評分記錄
      const latest = scoreRecords[0];

      // 還原各維度評分
      if (latest.scores) {
        DIMENSIONS.forEach((dim) => {
          if (latest.scores[dim] !== undefined) {
            scores[dim] = latest.scores[dim];
            const item = document.querySelector(
              `.rating-item[data-dimension="${dim}"]`,
            );
            if (item) {
              const starRating = item.querySelector(".star-rating");
              updateStars(starRating, scores[dim]);
            }
          }
        });
      }

      // 還原評論
      if (latest.comment) {
        scoreComment.value = latest.comment;
      }

      // 更新總分顯示
      updateTotalScore();
      return true;
    }

    return false;
  } catch (error) {
    console.error("載入評分記錄失敗:", error);
    return false;
  }
}

async function restoreLatestScoresToForm() {
  const lessonId =
    (window.LPR && window.LPR.getCurrentLessonId()) ||
    localStorage.getItem(CURRENT_LESSON_KEY) ||
    localStorage.getItem(LEGACY_CURRENT_LESSON_KEY);

  if (!lessonId) {
    return false;
  }

  try {
    const data = await window.LPR.request(`/scores/history/${lessonId}`);
    const records = Array.isArray(data.scores) ? data.scores : [];

    if (records.length === 0) {
      return false;
    }

    const latestRecord = records[0];

    const restoredScores = latestRecord.scores || {};
    DIMENSIONS.forEach((dimension) => {
      const ratingItem = document.querySelector(
        `[data-dimension="${dimension}"]`,
      );
      if (ratingItem) {
        const starRating = ratingItem.querySelector(".star-rating");
        if (starRating) {
          const value = Number(restoredScores[dimension]);
          if (Number.isFinite(value) && value > 0) {
            scores[dimension] = value;
            updateStars(starRating, value);
          }
        }
      }
    });

    if (scoreComment && latestRecord.comment) {
      scoreComment.value = latestRecord.comment;
    }

    updateTotalScore();
    return true;
  } catch (error) {
    console.error("載入歷史評分失敗:", error);
    return false;
  }
}

// ============================================
// Toast 提示訊息
// ============================================

function showToast(message, type = "success") {
  // 移除現有的 toast
  const existingToast = document.querySelector(".score-toast");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.className = `score-toast score-toast--${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  // 3 秒後自動移除
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ============================================
// 初始化
// ============================================

document.addEventListener("DOMContentLoaded", async () => {
  initStarRatings();
  const hasCurrentScore = await loadExistingScores();
  if (!hasCurrentScore) {
    await restoreLatestScoresToForm();
  }

  // ✅ 新增：檢查是否有來自 lesson-review.html 的選定文字
  const selectedReviewText = sessionStorage.getItem("selectedReviewText");
  if (selectedReviewText) {
    // 將選定的文字加入到評分說明區域
    if (scoreComment && scoreComment.value) {
      // 如果已有內容，換行後添加
      scoreComment.value += "\n\n" + selectedReviewText;
    } else {
      // 否則直接設置
      scoreComment.value = selectedReviewText;
    }

    // 清除 sessionStorage
    sessionStorage.removeItem("selectedReviewText");

    // 顯示提示訊息
    showToast("已將選定的評論內容加入評分說明");

    // 滾動到評分說明區域
    setTimeout(() => {
      scoreComment.scrollIntoView({ behavior: "smooth", block: "center" });
      scoreComment.focus();
    }, 300);
  }
});

function handleResetBtn() {
  // 立即禁用按鈕，向用戶表示點擊已被註冊
  resetBtn.disabled = true;

  // 在下一個微任務中顯示確認對話框，讓瀏覽器有時間更新 UI
  Promise.resolve()
    .then(() => {
      const confirmed = window.confirm(
        "確定要重置所有評分紀錄嗎？此操作無法復原。",
      );

      if (confirmed) {
        resetAllScores();
      }
    })
    .finally(() => {
      // 確認完成後恢復按鈕
      resetBtn.disabled = false;
    });
}

resetBtn.addEventListener("click", handleResetBtn);
saveBtn.addEventListener("click", saveScores);

// ============================================
// PDF 匯出
// ============================================

const exportPdfBtn = document.getElementById("exportPdfBtn");
if (exportPdfBtn) {
  exportPdfBtn.addEventListener("click", async () => {
    exportPdfBtn.disabled = true;
    try {
      const lessonId =
        (window.LPR && window.LPR.getCurrentLessonId()) ||
        localStorage.getItem(CURRENT_LESSON_KEY) ||
        localStorage.getItem(LEGACY_CURRENT_LESSON_KEY);

      const lessonName = lessonId ? `教案-${lessonId}` : "教案評分報告";

      await window.PDFExporter.exportScoreReport(scores, lessonName);
      showToast("PDF 匯出成功", "success");
    } catch (error) {
      console.error("匯出 PDF 失敗:", error);
      showToast("PDF 匯出失敗，請稍後重試", "error");
    } finally {
      exportPdfBtn.disabled = false;
    }
  });
}
