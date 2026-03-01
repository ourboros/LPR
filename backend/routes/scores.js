// ============================================
// 評分路由 - 處理教案評分
// ============================================

const express = require("express");
const router = express.Router();

// 記憶體儲存評分記錄
const scoreStore = new Map();

/**
 * POST /api/scores
 * 提交教案評分
 */
router.post("/", (req, res) => {
  try {
    const { lessonId, scores, total, comment } = req.body;

    // 驗證輸入
    if (!lessonId) {
      return res.status(400).json({ error: "請提供教案 ID" });
    }

    if (!scores || typeof scores !== "object") {
      return res.status(400).json({ error: "請提供有效的評分資料" });
    }

    // 驗證評分範圍
    const scoreValues = Object.values(scores);
    if (scoreValues.some((score) => score < 0 || score > 5)) {
      return res.status(400).json({ error: "評分必須在 0-5 之間" });
    }

    // 計算總分（如果未提供）
    const calculatedTotal =
      total ||
      scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length;

    // 建立評分記錄
    const scoreId = Date.now() + Math.random();
    const scoreRecord = {
      id: scoreId,
      lessonId,
      scores,
      total: Math.round(calculatedTotal * 10) / 10, // 四捨五入到小數點第一位
      comment: comment || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 儲存評分
    scoreStore.set(scoreId, scoreRecord);

    res.json({
      success: true,
      scoreId,
      message: "評分已儲存",
      score: scoreRecord,
    });
  } catch (error) {
    console.error("儲存評分錯誤:", error);
    res.status(500).json({
      error: "儲存評分時發生錯誤",
      message: error.message,
    });
  }
});

/**
 * GET /api/scores/lesson/:lessonId
 * 取得特定教案的所有評分
 */
router.get("/lesson/:lessonId", (req, res) => {
  try {
    const lessonId = parseFloat(req.params.lessonId);

    const scores = Array.from(scoreStore.values())
      .filter((score) => score.lessonId === lessonId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(scores);
  } catch (error) {
    console.error("取得評分錯誤:", error);
    res.status(500).json({
      error: "取得評分時發生錯誤",
      message: error.message,
    });
  }
});

/**
 * GET /api/scores/:scoreId
 * 取得特定評分記錄
 */
router.get("/:scoreId", (req, res) => {
  try {
    const scoreId = parseFloat(req.params.scoreId);
    const score = scoreStore.get(scoreId);

    if (!score) {
      return res.status(404).json({ error: "找不到指定的評分記錄" });
    }

    res.json(score);
  } catch (error) {
    console.error("取得評分錯誤:", error);
    res.status(500).json({
      error: "取得評分時發生錯誤",
      message: error.message,
    });
  }
});

/**
 * PUT /api/scores/:scoreId
 * 更新評分記錄
 */
router.put("/:scoreId", (req, res) => {
  try {
    const scoreId = parseFloat(req.params.scoreId);
    const existingScore = scoreStore.get(scoreId);

    if (!existingScore) {
      return res.status(404).json({ error: "找不到指定的評分記錄" });
    }

    const { scores, total, comment } = req.body;

    // 更新評分
    if (scores) {
      const scoreValues = Object.values(scores);
      if (scoreValues.some((score) => score < 0 || score > 5)) {
        return res.status(400).json({ error: "評分必須在 0-5 之間" });
      }
      existingScore.scores = scores;
    }

    if (total !== undefined) {
      existingScore.total = Math.round(total * 10) / 10;
    } else if (scores) {
      const scoreValues = Object.values(existingScore.scores);
      existingScore.total =
        Math.round(
          (scoreValues.reduce((sum, score) => sum + score, 0) /
            scoreValues.length) *
            10,
        ) / 10;
    }

    if (comment !== undefined) {
      existingScore.comment = comment;
    }

    existingScore.updatedAt = new Date().toISOString();

    scoreStore.set(scoreId, existingScore);

    res.json({
      success: true,
      message: "評分已更新",
      score: existingScore,
    });
  } catch (error) {
    console.error("更新評分錯誤:", error);
    res.status(500).json({
      error: "更新評分時發生錯誤",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/scores/:scoreId
 * 刪除評分記錄
 */
router.delete("/:scoreId", (req, res) => {
  try {
    const scoreId = parseFloat(req.params.scoreId);
    const score = scoreStore.get(scoreId);

    if (!score) {
      return res.status(404).json({ error: "找不到指定的評分記錄" });
    }

    scoreStore.delete(scoreId);

    res.json({
      success: true,
      message: "評分已刪除",
    });
  } catch (error) {
    console.error("刪除評分錯誤:", error);
    res.status(500).json({
      error: "刪除評分時發生錯誤",
      message: error.message,
    });
  }
});

/**
 * GET /api/scores
 * 取得所有評分記錄
 */
router.get("/", (req, res) => {
  try {
    const scores = Array.from(scoreStore.values()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );

    res.json(scores);
  } catch (error) {
    console.error("取得所有評分錯誤:", error);
    res.status(500).json({
      error: "取得評分時發生錯誤",
      message: error.message,
    });
  }
});

module.exports = router;
