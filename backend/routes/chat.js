// ============================================
// 對話路由 - 處理 AI 對話請求
// ============================================

const express = require("express");
const router = express.Router();
const ragService = require("../services/rag-simple");
const Lesson = require("../models/Lesson");

// 記憶體儲存（簡單實作）
const sessions = new Map();

/**
 * POST /api/chat
 * 處理 AI 對話請求
 */
router.post("/", async (req, res) => {
  try {
    const { message, selectedSources, chatHistory, sessionId } = req.body;

    // 驗證輸入
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "請提供有效的訊息內容",
      });
    }

    // 取得或建立 session
    const sid = sessionId || generateSessionId();
    let history = sessions.get(sid) || [];

    // 取得選擇的教案內容
    let lessonContent = null;
    if (selectedSources && selectedSources.length > 0) {
      const lessonSections = [];

      for (const sourceId of selectedSources) {
        const lesson = await findLessonById(sourceId);
        if (lesson) {
          lessonSections.push(`【${lesson.name}】\n${lesson.content}`);
        }
      }

      lessonContent = lessonSections.join("\n\n");
    }

    // 使用 RAG 服務生成回應
    const response = await ragService.generateComment(
      message,
      lessonContent,
      chatHistory || history,
    );

    // 更新對話歷史
    history.push({ role: "user", content: message });
    history.push(response);
    sessions.set(sid, history);

    // 回傳結果
    res.json({
      ...response,
      sessionId: sid,
    });
  } catch (error) {
    handleAiRouteError(res, "處理對話時發生錯誤", error);
  }
});

/**
 * POST /api/chat/analyze
 * 分析教案結構
 */
router.post("/analyze", async (req, res) => {
  try {
    const { lessonId } = req.body;

    if (!lessonId) {
      return res.status(400).json({ error: "請提供教案 ID" });
    }

    const lesson = await findLessonById(lessonId);
    if (!lesson) {
      return res.status(404).json({ error: "找不到指定的教案" });
    }

    const message =
      "請分析這份教案的結構完整性、各階段安排是否合理，並提供改進建議。";
    const response = await ragService.generateComment(message, lesson.content);

    res.json(response);
  } catch (error) {
    handleAiRouteError(res, "分析教案時發生錯誤", error);
  }
});

/**
 * POST /api/chat/score
 * 評估教案品質
 */
router.post("/score", async (req, res) => {
  try {
    const { lessonId } = req.body;

    if (!lessonId) {
      return res.status(400).json({ error: "請提供教案 ID" });
    }

    const lesson = await findLessonById(lessonId);
    if (!lesson) {
      return res.status(404).json({ error: "找不到指定的教案" });
    }

    const message =
      "請根據評分標準，對這份教案進行全面評估，並給出各維度的評分建議（1-5分）。";
    const response = await ragService.generateComment(message, lesson.content);

    res.json(response);
  } catch (error) {
    handleAiRouteError(res, "評估教案時發生錯誤", error);
  }
});

/**
 * POST /api/chat/suggest
 * 提供改進建議
 */
router.post("/suggest", async (req, res) => {
  try {
    const { lessonId } = req.body;

    if (!lessonId) {
      return res.status(400).json({ error: "請提供教案 ID" });
    }

    const lesson = await findLessonById(lessonId);
    if (!lesson) {
      return res.status(404).json({ error: "找不到指定的教案" });
    }

    const message =
      "請針對這份教案提供具體的改進建議，包括優點強化和弱點改善的方向。";
    const response = await ragService.generateComment(message, lesson.content);

    res.json(response);
  } catch (error) {
    handleAiRouteError(res, "生成建議時發生錯誤", error);
  }
});

/**
 * POST /api/chat/compare
 * 比較不同教案
 */
router.post("/compare", async (req, res) => {
  try {
    const { lessonIds } = req.body;

    if (!lessonIds || !Array.isArray(lessonIds) || lessonIds.length < 2) {
      return res.status(400).json({ error: "請提供至少兩個教案 ID 進行比較" });
    }

    const lessons = [];
    for (const id of lessonIds) {
      const lesson = await findLessonById(id);
      if (lesson) {
        lessons.push(lesson);
      }
    }

    if (lessons.length < 2) {
      return res.status(404).json({ error: "找不到足夠的教案進行比較" });
    }

    const lessonContent = lessons
      .map(
        (lesson, index) =>
          `【教案 ${index + 1}: ${lesson.name}】\n${lesson.content}`,
      )
      .join("\n\n---\n\n");

    const message =
      "請比較這些教案的優缺點，分析各自的特色和可以互相學習的地方。";
    const response = await ragService.generateComment(message, lessonContent);

    res.json(response);
  } catch (error) {
    handleAiRouteError(res, "比較教案時發生錯誤", error);
  }
});

/**
 * DELETE /api/chat/session/:sessionId
 * 清除對話歷史
 */
router.delete("/session/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  sessions.delete(sessionId);
  res.json({ message: "對話歷史已清除" });
});

/**
 * GET /api/chat/criteria
 * 取得所有評分標準
 */
router.get("/criteria", (req, res) => {
  try {
    const criteria = ragService.getAllCriteria();
    res.json(criteria);
  } catch (error) {
    console.error("取得評分標準錯誤:", error);
    res.status(500).json({
      error: "取得評分標準時發生錯誤",
      message: error.message,
    });
  }
});

/**
 * POST /api/chat/modify-comment
 * 使用 AI 修改選取的評論
 */
router.post("/modify-comment", async (req, res) => {
  try {
    const { originalComment, instruction } = req.body;

    // 驗證輸入
    if (!originalComment || typeof originalComment !== "string") {
      return res.status(400).json({
        error: "請提供原始評論",
      });
    }

    if (!instruction || typeof instruction !== "string") {
      return res.status(400).json({
        error: "請提供修改指示",
      });
    }

    // 建構 AI 提示詞
    const prompt = `你是專業的教育教案評論修改助手。
請根據以下指示修改原始評論：

【原始評論】
${originalComment}

【修改指示】
${instruction}

【要求】
1. 保持專業教育評論風格
2. 只輸出修改後的評論文字，不要加任何前綴說明（如「修改後的評論：」）
3. 保持評論的完整性和連貫性
4. 根據指示調整語氣、內容或結構
5. 回應長度應與原始評論相近

請直接輸出修改後的評論：`;

    // 呼叫 Gemini API
    const geminiClient = require("../services/geminiClient");
    const modifiedComment = await geminiClient.generateResponse(prompt);

    res.json({
      success: true,
      modifiedComment: modifiedComment.trim(),
    });
  } catch (error) {
    handleAiRouteError(res, "修改評論時發生錯誤", error);
  }
});

function handleAiRouteError(res, fallbackMessage, error) {
  console.error(`${fallbackMessage}:`, error);

  const message = String(error?.message || "未知錯誤");
  const isQuotaError =
    /配額|quota|429|rate limit|resource has been exhausted/i.test(message);

  if (isQuotaError) {
    return res.status(429).json({
      error: fallbackMessage,
      message: "AI API 配額已用盡，請稍後再試或更換可用 API 金鑰。",
    });
  }

  return res.status(500).json({
    error: fallbackMessage,
    message,
  });
}

/**
 * 生成 session ID
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function findLessonById(rawLessonId) {
  const lessonId = parseFloat(rawLessonId);

  if (Number.isNaN(lessonId)) {
    return null;
  }

  return Lesson.findOne({ lessonId }, { _id: 0, __v: 0 }).lean();
}

module.exports = router;
