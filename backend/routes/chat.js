// ============================================
// 對話路由 - 處理 AI 對話請求
// ============================================

const express = require("express");
const router = express.Router();
const { verifyTokenMiddleware } = require("../middleware/auth");
const ragService = require("../services/rag-simple");
const Lesson = require("../models/Lesson");
const ReviewRecord = require("../models/ReviewRecord");

// 記憶體儲存（簡單實作）
const sessions = new Map();

router.use(verifyTokenMiddleware({ allowGuest: true }));

function buildLessonScopeFilter(req) {
  if (req.user?.id) {
    return { userId: req.user.id };
  }

  if (req.sessionId) {
    return { userId: null, sessionId: req.sessionId };
  }

  return { userId: null, sessionId: "__no_session__" };
}

/**
 * POST /api/chat
 * 處理 AI 對話請求
 */
router.post("/", async (req, res) => {
  try {
    const {
      message,
      selectedSources,
      chatHistory,
      sessionId,
      mode,
      action,
      maxChars,
    } = req.body;

    // 診斷日誌
    console.log("[Chat POST /] 收到對話請求:", {
      mode,
      action,
      message: message?.substring(0, 50),
      sessionId: req.sessionId,
      userId: req.user?.id,
      selectedSources,
    });

    // 驗證輸入
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "請提供有效的訊息內容",
      });
    }

    // 取得或建立 session
    const sid = sessionId || generateSessionId();
    let history = sessions.get(sid) || [];

    const normalizedMode = normalizeMode(mode);
    const normalizedAction = normalizeAction(action);
    const safeHistory = sanitizeChatHistory(chatHistory || history);
    const safeSelectedSources = normalizeSelectedSources(selectedSources);

    // 取得選擇的教案內容
    let lessonContent = null;
    if (safeSelectedSources.length > 0) {
      const lessonSections = [];
      const failedSources = [];

      for (const sourceId of safeSelectedSources) {
        const lesson = await safeFindLessonById(sourceId, req);
        if (lesson) {
          lessonSections.push(`【${lesson.name}】\n${lesson.content}`);
        } else {
          failedSources.push(sourceId);
        }
      }

      lessonContent = lessonSections.join("\n\n");

      // ✅ 改進：添加詳細的診斷日誌
      if (failedSources.length > 0) {
        console.warn(`[Chat API] 部分教案查詢失敗 - 找不到教案`, {
          requestedSources: safeSelectedSources,
          foundSources: safeSelectedSources.length - failedSources.length,
          failedSources,
          userId: req.user?.id || null,
          sessionId: req.sessionId || null,
          mode: normalizedMode,
        });
      }
    } else {
      console.warn(`[Chat API] selectedSources 為空`, {
        requestBody: req.body,
      });
    }

    // ✅ 改進：mode 為 summary 但找不到內容時，返回更詳細的錯誤
    if (normalizedMode === "summary" && !lessonContent) {
      console.error(`[Chat API] 無法生成摘要 - 找不到教案內容`, {
        mode: normalizedMode,
        selectedSources: safeSelectedSources,
        userId: req.user?.id,
        sessionId: req.sessionId,
      });

      return res.status(400).json({
        error: "找不到可用的教案內容",
        message: "請確保已上傳教案並在上傳頁面選擇教案後再進行分析",
        details: {
          selectedSources: safeSelectedSources,
          hasUser: !!req.user?.id,
          hasSessionId: !!req.sessionId,
        },
      });
    }

    // 使用 RAG 服務生成回應
    const response = await ragService.generateComment(
      message,
      lessonContent,
      safeHistory,
      {
        mode: normalizedMode,
        action: normalizedAction,
        maxChars: normalizeMaxChars(maxChars),
      },
    );

    const normalizedContent = String(response?.content || "").trim();
    if (!normalizedContent) {
      throw new Error("AI 回傳內容為空");
    }

    // 更新對話歷史
    history.push({ role: "user", content: message });
    history.push({ ...response, content: normalizedContent });
    sessions.set(sid, history);

    console.log("[Chat POST /] 準備保存評論記錄:", {
      lessonId: safeSelectedSources[0],
      mode: normalizedMode,
      action: normalizedAction,
      sessionId: req.sessionId,
      userId: req.user?.id,
    });

    const savedReview = await persistReviewRecord({
      lessonId: safeSelectedSources[0] || null,
      sessionId: req.user ? null : req.sessionId || null,
      userId: req.user?.id || null,
      mode: normalizedMode,
      action: normalizedAction,
      userPrompt: message,
      aiContent: normalizedContent,
      sources: response.sources,
    });

    console.log("[Chat POST /] 評論記錄保存結果:", {
      saved: !!savedReview,
      reviewId: savedReview?.reviewId,
      mode: normalizedMode,
    });

    // ✅ 方案三：即使保存失敗也返回結果，不阻止用戶
    if (normalizedMode === "review-formal" && !savedReview) {
      console.warn("正式評論記錄保存失敗，但評論內容已生成", {
        mode: normalizedMode,
        action: normalizedAction,
      });
      // 不再拋出錯誤，繼續執行
    }

    // 回傳結果
    res.json({
      ...response,
      content: normalizedContent,
      sessionId: sid,
      reviewId: savedReview?.reviewId || null,
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
    const { lessonId, maxChars } = req.body;

    if (!lessonId) {
      return res.status(400).json({ error: "請提供教案 ID" });
    }

    const lesson = await findLessonById(lessonId, req);
    if (!lesson) {
      return res.status(404).json({ error: "找不到指定的教案" });
    }

    const message =
      "請分析這份教案的結構完整性、各階段安排是否合理，並提供改進建議。";
    const response = await ragService.generateComment(
      message,
      lesson.content,
      [],
      {
        mode: "quick-action",
        action: "analyze",
        maxChars: normalizeMaxChars(maxChars, 300),
      },
    );

    await persistReviewRecord({
      lessonId: lesson.lessonId,
      sessionId: req.user ? null : req.sessionId || null,
      userId: req.user?.id || null,
      mode: "chat-free",
      action: "analyze",
      userPrompt: message,
      aiContent: response.content,
      sources: response.sources,
    });

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
    const { lessonId, maxChars } = req.body;

    if (!lessonId) {
      return res.status(400).json({ error: "請提供教案 ID" });
    }

    const lesson = await findLessonById(lessonId, req);
    if (!lesson) {
      return res.status(404).json({ error: "找不到指定的教案" });
    }

    const message =
      "請根據評分標準，對這份教案進行全面評估，並給出各維度的評分建議（1-5分）。";
    const response = await ragService.generateComment(
      message,
      lesson.content,
      [],
      {
        mode: "quick-action",
        action: "score",
        maxChars: normalizeMaxChars(maxChars, 300),
      },
    );

    await persistReviewRecord({
      lessonId: lesson.lessonId,
      sessionId: req.user ? null : req.sessionId || null,
      userId: req.user?.id || null,
      mode: "chat-free",
      action: "score",
      userPrompt: message,
      aiContent: response.content,
      sources: response.sources,
    });

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
    const { lessonId, maxChars } = req.body;

    if (!lessonId) {
      return res.status(400).json({ error: "請提供教案 ID" });
    }

    const lesson = await findLessonById(lessonId, req);
    if (!lesson) {
      return res.status(404).json({ error: "找不到指定的教案" });
    }

    const message =
      "請針對這份教案提供具體的改進建議，包括優點強化和弱點改善的方向。";
    const response = await ragService.generateComment(
      message,
      lesson.content,
      [],
      {
        mode: "quick-action",
        action: "suggest",
        maxChars: normalizeMaxChars(maxChars, 300),
      },
    );

    await persistReviewRecord({
      lessonId: lesson.lessonId,
      sessionId: req.user ? null : req.sessionId || null,
      userId: req.user?.id || null,
      mode: "chat-free",
      action: "suggest",
      userPrompt: message,
      aiContent: response.content,
      sources: response.sources,
    });

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
      const lesson = await findLessonById(id, req);
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
    const response = await ragService.generateComment(
      message,
      lessonContent,
      [],
      {
        mode: "chat-free",
        action: "compare",
      },
    );

    await persistReviewRecord({
      lessonId: lessons[0]?.lessonId,
      sessionId: req.user ? null : req.sessionId || null,
      userId: req.user?.id || null,
      mode: "chat-free",
      action: "compare",
      userPrompt: message,
      aiContent: response.content,
      sources: response.sources,
    });

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
    const {
      originalComment,
      fullComment,
      selectedText,
      selectionStart,
      selectionEnd,
      plainContextBefore,
      plainContextAfter,
      plainSnapshot,
      instruction,
      lessonId,
      reviewId,
    } = req.body;

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

    const normalizedFullComment = String(fullComment || "").trim();
    const selectedTextRaw = String(selectedText || originalComment || "");
    const normalizedSelectedText = selectedTextRaw.trim();
    const normalizedSelectionStart = Number.parseInt(selectionStart, 10);
    const normalizedSelectionEnd = Number.parseInt(selectionEnd, 10);
    const normalizedPlainContextBefore = String(plainContextBefore || "");
    const normalizedPlainContextAfter = String(plainContextAfter || "");
    const normalizedPlainSnapshot = String(plainSnapshot || "");

    if (!normalizedFullComment) {
      return res.status(400).json({
        error: "請提供完整評論內容",
      });
    }

    if (!normalizedSelectedText) {
      return res.status(400).json({
        error: "請提供選取段落內容",
      });
    }

    const normalizedReviewId = normalizeReviewId(reviewId);
    if (!normalizedReviewId) {
      return res.status(400).json({
        error: "請提供有效的評論編號",
      });
    }

    const normalizedLessonId = normalizeLessonId(lessonId);
    const targetReview = await ReviewRecord.findOne({
      ...buildLessonScopeFilter(req),
      reviewId: normalizedReviewId,
      lessonId: normalizedLessonId,
      deletedAt: null,
    }).lean();

    if (!targetReview) {
      return res.status(404).json({
        error: "找不到要修改的評論紀錄",
      });
    }

    const plainPosition = locateSelectedSpanByAnchors(
      normalizedPlainSnapshot,
      selectedTextRaw,
      normalizedPlainContextBefore,
      normalizedPlainContextAfter,
      normalizedSelectionStart,
      normalizedSelectionEnd,
    );

    const alignmentStrictFail =
      !plainPosition.isUnique &&
      !Number.isFinite(normalizedSelectionStart) &&
      plainPosition.candidateCount > 1;

    if (alignmentStrictFail) {
      return res.status(422).json({
        error: "修改評論時發生錯誤",
        code: "ALIGNMENT_NOT_UNIQUE",
        message: "無法唯一定位選取段落，請縮小選取範圍後再試。",
        hint: "請重新選取更短且更具辨識度的文字，再執行修改。",
        details: {
          method: plainPosition.method,
          candidateCount: plainPosition.candidateCount,
        },
      });
    }

    if (
      plainPosition.method === "fallback-index" &&
      Number.isFinite(normalizedSelectionStart) &&
      Math.abs(plainPosition.start - normalizedSelectionStart) > 160
    ) {
      return res.status(422).json({
        error: "修改評論時發生錯誤",
        code: "ALIGNMENT_LOW_CONFIDENCE",
        message: "選取段落定位可信度不足，請重新選取後再試。",
        hint: "建議縮小選取範圍，並避免只選取重複出現的短語句。",
        details: {
          method: plainPosition.method,
          serverStart: plainPosition.start,
          clientStart: normalizedSelectionStart,
        },
      });
    }

    const markdownSelection = locateSelectionSpanInMarkdown({
      fullComment: normalizedFullComment,
      selectedText: selectedTextRaw,
      plainStart: plainPosition.start,
      plainEnd: plainPosition.end,
    });

    if (!markdownSelection.found) {
      return res.status(422).json({
        error: "修改評論時發生錯誤",
        code: "MARKDOWN_SPAN_NOT_FOUND",
        message: "無法在原評論中定位選取段落，請重新選取後再試。",
        hint: "請選取更具辨識度的完整句子，避免過短或重複片段。",
        details: {
          method: plainPosition.method,
          plainStart: plainPosition.start,
          plainEnd: plainPosition.end,
        },
      });
    }

    const selectedMarkdownSlice = normalizedFullComment.slice(
      markdownSelection.start,
      markdownSelection.end,
    );

    // 呼叫 Gemini API 只生成替換片段
    const geminiClient = require("../services/geminiClient");
    const replacementPrompt = `你是專業的教育教案評論修改助手。
請根據使用者指示，僅改寫「選取段落」本身。

【選取段落（原文）】
${selectedMarkdownSlice}

【修改指示】
${instruction}

【要求】
1. 只輸出「替換後段落文字」，不要輸出整篇評論。
2. 不要加任何前綴或說明（例如：修改後）。
3. 保持原段落語氣與語境一致。
4. 盡量保留原有 Markdown 語法風格。

請直接輸出替換後段落：`;

    const replacementTextRaw =
      await geminiClient.generateResponse(replacementPrompt);
    const replacementText = String(replacementTextRaw || "").trim();

    if (!replacementText) {
      throw buildGuardError(
        "PATCH_TEXT_INVALID",
        "修改結果為空白，無法套用片段覆蓋。",
        "請提供更具體的修改指示後再試。",
      );
    }

    if (!isLikelySafeReplacement(selectedMarkdownSlice, replacementText)) {
      throw buildGuardError(
        "PATCH_TEXT_INVALID",
        "修改內容變化過大，系統已拒收此修改。",
        "請試試：1) 選取更小的文段後重試，2) 提供更描述性的修改指示，或 3) 清除所有修改後重新開始。",
      );
    }

    const modifiedComment =
      normalizedFullComment.slice(0, markdownSelection.start) +
      replacementText +
      normalizedFullComment.slice(markdownSelection.end);

    await ReviewRecord.updateOne(
      {
        ...buildLessonScopeFilter(req),
        reviewId: normalizedReviewId,
        lessonId: normalizedLessonId,
        deletedAt: null,
      },
      {
        $set: {
          aiContent: modifiedComment.trim(),
          userPrompt: "",
          action: "modify",
          sources: [],
        },
      },
    );

    res.json({
      success: true,
      modifiedComment: modifiedComment.trim(),
      fullComment: modifiedComment.trim(),
      reviewId: normalizedReviewId,
      selectionGuard: {
        method: "segment-overwrite",
        isUnique: markdownSelection.isUnique,
        candidateCount: markdownSelection.candidateCount,
        replacedLength: selectedMarkdownSlice.length,
        replacementLength: replacementText.length,
      },
    });
  } catch (error) {
    handleAiRouteError(res, "修改評論時發生錯誤", error);
  }
});

function handleAiRouteError(res, fallbackMessage, error) {
  console.error(`${fallbackMessage}:`, error);

  if (error?.status === 422) {
    return res.status(422).json({
      error: fallbackMessage,
      code: error.code || "MODIFY_GUARD_REJECTED",
      message: error.message || "修改結果未通過一致性檢查，請重新選取後再試。",
      hint: error.hint || "請縮小選取範圍並提供更具體修改指示。",
      details: error.details || undefined,
    });
  }

  const message = String(error?.message || "未知錯誤");

  // ✅ 改進：檢查 503 Service Unavailable 錯誤
  if (/503|Service Unavailable|高需求/i.test(message)) {
    return res.status(503).json({
      error: "Google AI 服務目前負載過高",
      message:
        "系統已自動重試 3 次。請稍後再試，或稍等 10-30 秒後重新整理頁面。",
      retryable: true,
    });
  }

  // 配額和速率限制錯誤
  const isQuotaError =
    /配額|quota|429|rate limit|resource has been exhausted|頻繁/i.test(message);

  if (isQuotaError) {
    return res.status(429).json({
      error: "請求過於頻繁",
      message: "請等待幾秒鐘後再試，或檢查 API 配額設定。",
      retryable: true,
    });
  }

  // ✅ 改進：提供更多錯誤上下文
  return res.status(500).json({
    error: fallbackMessage,
    message: message || "未知錯誤",
    statusCode: error?.statusCode || 500,
    userMessage:
      error?.userMessage || "處理您的請求時發生錯誤，請重新整理後重試。",
  });
}

/**
 * 生成 session ID
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function normalizeMode(mode) {
  const allowed = new Set([
    "summary",
    "quick-action",
    "chat-free",
    "review-formal",
  ]);
  return allowed.has(mode) ? mode : "chat-free";
}

function normalizeAction(action) {
  if (!action || typeof action !== "string") {
    return "free";
  }

  return action;
}

function normalizeLessonId(rawLessonId) {
  const lessonId = Number.parseFloat(rawLessonId);
  if (!Number.isFinite(lessonId)) {
    return null;
  }

  return lessonId;
}

function normalizeMaxChars(maxChars, fallback) {
  const parsed = Number.parseInt(maxChars, 10);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function normalizeSelectedSources(selectedSources) {
  if (!Array.isArray(selectedSources)) {
    return [];
  }

  return selectedSources
    .map((item) => normalizeLessonId(item))
    .filter((id) => Number.isFinite(id));
}

function sanitizeChatHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) {
    return [];
  }

  const normalized = rawHistory
    .map((item) => {
      const role = item?.role === "assistant" ? "assistant" : "user";
      const content = String(item?.content || "").trim();
      return { role, content };
    })
    .filter((item) => item.content.length > 0)
    .slice(-20);

  while (normalized.length > 0 && normalized[0].role !== "user") {
    normalized.shift();
  }

  return normalized;
}

async function findLessonById(rawLessonId, req) {
  const lessonId = normalizeLessonId(rawLessonId);

  if (!lessonId) {
    return null;
  }

  return Lesson.findOne(
    {
      ...buildLessonScopeFilter(req),
      lessonId,
    },
    { _id: 0, __v: 0 },
  ).lean();
}

async function safeFindLessonById(rawLessonId, req) {
  try {
    return await findLessonById(rawLessonId, req);
  } catch (error) {
    console.warn("查詢教案失敗，略過來源不影響主流程:", error.message);
    return null;
  }
}

async function persistReviewRecord(payload = {}) {
  try {
    // ✅ 方案三：檢查必要的內容，即使沒有 lessonId 也繼續
    if (!payload.aiContent) {
      return null;
    }

    const lessonId = normalizeLessonId(payload.lessonId);

    // ✅ 方案一：修復對象結構 - 創建符合期望的 mockReq 對象
    let lesson = null;
    if (lessonId) {
      const mockReq = {
        user: payload.userId ? { id: payload.userId } : null,
        sessionId: payload.sessionId || null,
      };

      lesson = await findLessonById(lessonId, mockReq);

      // ✅ 方案三：添加詳細日誌用於診斷
      if (!lesson) {
        console.warn("評論記錄查詢教案失敗，將創建無關聯的評論記錄:", {
          lessonId,
          userId: payload.userId,
          sessionId: payload.sessionId,
        });
      }
    }

    const reviewId = Date.now() * 1000 + Math.floor(Math.random() * 1000);

    // ✅ 方案三：容錯邏輯 - 即使教案查詢失敗也保存記錄
    return await ReviewRecord.create({
      reviewId,
      lessonId: lesson?.lessonId || lessonId || null, // 使用查詢結果或傳入的 ID
      contentHash: lesson?.contentHash || "",
      sessionId: payload.sessionId || null,
      userId: payload.userId || null,
      mode: payload.mode || "chat-free",
      action: payload.action || "free",
      userPrompt: payload.userPrompt || "",
      aiContent: payload.aiContent,
      sources: Array.isArray(payload.sources)
        ? payload.sources.map((item) => String(item))
        : [],
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("儲存評論紀錄失敗:", error.message);
    // ✅ 方案三：保存失敗返回 null，不拋出異常
    return null;
  }
}

function normalizeReviewId(rawReviewId) {
  const reviewId = Number.parseInt(rawReviewId, 10);
  if (!Number.isFinite(reviewId)) {
    return null;
  }

  return reviewId;
}

function locateSelectionSpanInMarkdown({
  fullComment,
  selectedText,
  plainStart,
  plainEnd,
}) {
  const source = String(fullComment || "");
  const target = String(selectedText || "").trim();

  if (!source || !target) {
    return {
      found: false,
      start: -1,
      end: -1,
      isUnique: false,
      candidateCount: 0,
    };
  }

  const candidates = [];
  let cursor = 0;
  while (cursor < source.length) {
    const idx = source.indexOf(target, cursor);
    if (idx < 0) {
      break;
    }

    const prefixPlainLen = markdownToPlainText(source.slice(0, idx)).length;
    const plainDistance = Number.isFinite(plainStart)
      ? Math.abs(prefixPlainLen - plainStart)
      : 0;

    candidates.push({
      start: idx,
      end: idx + target.length,
      plainDistance,
    });
    cursor = idx + Math.max(1, target.length);
  }

  if (candidates.length === 0) {
    return {
      found: false,
      start: -1,
      end: -1,
      isUnique: false,
      candidateCount: 0,
    };
  }

  candidates.sort((a, b) => a.plainDistance - b.plainDistance);
  const best = candidates[0];

  const fallbackLength =
    Number.isFinite(plainStart) &&
    Number.isFinite(plainEnd) &&
    plainEnd >= plainStart
      ? plainEnd - plainStart
      : target.length;

  const expectedLen = Math.max(1, fallbackLength);
  const candidateLen = best.end - best.start;
  const lenDelta = Math.abs(candidateLen - expectedLen);
  const maxLenDelta = Math.max(32, Math.floor(expectedLen * 1.2));

  if (lenDelta > maxLenDelta && candidates.length === 1) {
    return {
      found: false,
      start: -1,
      end: -1,
      isUnique: true,
      candidateCount: 1,
    };
  }

  return {
    found: true,
    start: best.start,
    end: best.end,
    isUnique: candidates.length === 1,
    candidateCount: candidates.length,
  };
}

function isLikelySafeReplacement(originalSegment, replacementSegment) {
  const original = String(originalSegment || "").trim();
  const replacement = String(replacementSegment || "").trim();

  if (!replacement) {
    return false;
  }

  // Allow empty original (inserting new content)
  if (!original) {
    return true;
  }

  const originalLen = original.length;
  const replacementLen = replacement.length;

  // More flexible ratio: allow complete rewrites (ratio > 5) and significant shortening (ratio < 0.1)
  // This permits cases like:
  // - Replacing "短" with "很長的新文本很長的新文本" (ratio > 5 OK)
  // - Replacing "很長的原文本很長的原文本" with "短" (ratio < 0.1 OK)
  // - But still prevent suspicious changes like deleting everything or adding nothing
  const ratio = replacementLen / originalLen;
  const lengthDelta = Math.abs(replacementLen - originalLen);
  const maxDelta = Math.max(originalLen * 2, 200); // Allow big changes for short selections

  // Reject only if the change is suspiciously extreme
  if (lengthDelta > maxDelta && (ratio < 0.05 || ratio > 20)) {
    return false;
  }

  // Check for code block syntax abuse (prevent injecting ```  to break formatting)
  const tripleBacktickDelta =
    (replacement.match(/```/g) || []).length -
    (original.match(/```/g) || []).length;
  if (Math.abs(tripleBacktickDelta) > 2) {
    return false;
  }

  return true;
}

function hasCompleteEnding(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return false;
  }

  if (/[。！？.!?」』）)]\s*$/.test(normalized)) {
    return true;
  }

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return false;
  }

  const lastLine = lines[lines.length - 1];

  // 若最後一行是完整清單項，視為可接受結尾
  if (/^[-*+]\s+\S+/.test(lastLine) || /^\d+[.)]\s+\S+/.test(lastLine)) {
    return true;
  }

  // 避免把明顯未完結的尾巴視為完成
  if (/[，、,:：；（(\-]\s*$/.test(lastLine)) {
    return false;
  }

  return lastLine.length >= 8;
}

async function repairIncompleteEnding(text, geminiClient) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return normalized;
  }

  const repairPrompt = `請只修復以下內容的最後結尾，保持前文不變，不新增新段落，不改寫既有內容。

要求：
1. 只能修正最後一段或最後一句的收尾完整性。
2. 不可改動前文語意與結構。
3. 保留原有 Markdown 結構。
4. 請直接輸出修復後全文。

【原文】
${normalized}`;

  try {
    const repaired = await geminiClient.generateResponse(repairPrompt, [], {
      temperature: 0.2,
      maxOutputTokens: 2048,
    });
    return String(repaired || "").trim();
  } catch (error) {
    console.warn("repairIncompleteEnding 失敗:", error.message);
    return normalized;
  }
}

function isLikelyFullComment(candidate, originalFullComment) {
  const candidateText = String(candidate || "").trim();
  const originalText = String(originalFullComment || "").trim();

  if (!candidateText) {
    return false;
  }

  if (!originalText) {
    return candidateText.length > 0;
  }

  const minLength = Math.max(120, Math.floor(originalText.length * 0.55));
  return candidateText.length >= minLength;
}

function locateSelectedSpanByAnchors(
  plainSnapshot,
  selectedText,
  contextBefore,
  contextAfter,
  fallbackStart,
  fallbackEnd,
) {
  const text = String(plainSnapshot || "");
  const targetRaw = String(selectedText || "");
  const target = targetRaw.trim();
  const before = String(contextBefore || "");
  const after = String(contextAfter || "");

  if (!text || !target) {
    return {
      start: Number.isFinite(fallbackStart) ? fallbackStart : -1,
      end: Number.isFinite(fallbackEnd) ? fallbackEnd : -1,
      method: "fallback-index",
      isUnique: false,
      candidateCount: 0,
    };
  }

  const candidates = [];
  let candidateCursor = 0;
  while (candidateCursor < text.length) {
    const idx = text.indexOf(target, candidateCursor);
    if (idx < 0) {
      break;
    }
    candidates.push(idx);
    candidateCursor = idx + Math.max(1, target.length);
  }

  const selectNearest = (positions) => {
    if (!positions.length) {
      return -1;
    }
    if (!Number.isFinite(fallbackStart)) {
      return positions[0];
    }

    let nearest = positions[0];
    let minDistance = Math.abs(positions[0] - fallbackStart);
    for (let i = 1; i < positions.length; i += 1) {
      const distance = Math.abs(positions[i] - fallbackStart);
      if (distance < minDistance) {
        nearest = positions[i];
        minDistance = distance;
      }
    }
    return nearest;
  };

  if (before || after) {
    const exactMatches = [];
    for (const idx of candidates) {
      const beforeOk =
        !before || text.slice(Math.max(0, idx - before.length), idx) === before;
      const afterStart = idx + target.length;
      const afterOk =
        !after || text.slice(afterStart, afterStart + after.length) === after;

      if (beforeOk && afterOk) {
        exactMatches.push(idx);
      }
    }

    if (exactMatches.length === 1) {
      return {
        start: exactMatches[0],
        end: exactMatches[0] + target.length,
        method: "anchor-exact",
        isUnique: true,
        candidateCount: 1,
      };
    }

    if (exactMatches.length > 1) {
      const nearest = selectNearest(exactMatches);
      return {
        start: nearest,
        end: nearest + target.length,
        method: "anchor-ambiguous",
        isUnique: false,
        candidateCount: exactMatches.length,
      };
    }
  }

  if (candidates.length === 1) {
    return {
      start: candidates[0],
      end: candidates[0] + target.length,
      method: "unique-target",
      isUnique: true,
      candidateCount: 1,
    };
  }

  if (candidates.length > 1) {
    const nearest = selectNearest(candidates);
    return {
      start: nearest,
      end: nearest + target.length,
      method: "target-ambiguous",
      isUnique: false,
      candidateCount: candidates.length,
    };
  }

  return {
    start: Number.isFinite(fallbackStart) ? fallbackStart : -1,
    end: Number.isFinite(fallbackEnd) ? fallbackEnd : -1,
    method: "fallback-index",
    isUnique: Number.isFinite(fallbackStart) && Number.isFinite(fallbackEnd),
    candidateCount: 0,
  };
}

function locateSpanByContextsOnly(
  plainSnapshot,
  contextBefore,
  contextAfter,
  fallbackStart,
  fallbackEnd,
) {
  const text = String(plainSnapshot || "");
  const before = String(contextBefore || "");
  const after = String(contextAfter || "");
  const expectedLength =
    Number.isFinite(fallbackStart) && Number.isFinite(fallbackEnd)
      ? Math.max(0, fallbackEnd - fallbackStart)
      : 0;

  if (!text || (!before && !after)) {
    return {
      start: Number.isFinite(fallbackStart) ? fallbackStart : -1,
      end: Number.isFinite(fallbackEnd) ? fallbackEnd : -1,
      method: "fallback-index",
      isUnique: false,
      candidateCount: 0,
    };
  }

  const findAllOccurrences = (needle) => {
    if (!needle) {
      return [];
    }

    const results = [];
    let cursor = 0;
    while (cursor < text.length) {
      const idx = text.indexOf(needle, cursor);
      if (idx < 0) {
        break;
      }
      results.push(idx);
      cursor = idx + Math.max(1, needle.length);
    }
    return results;
  };

  const beforeStarts = findAllOccurrences(before).map(
    (idx) => idx + before.length,
  );
  const afterStarts = findAllOccurrences(after);

  if (beforeStarts.length > 0 && afterStarts.length > 0) {
    const pairCandidates = [];

    for (const start of beforeStarts) {
      for (const afterIdx of afterStarts) {
        if (afterIdx < start) {
          continue;
        }

        const spanLength = afterIdx - start;
        const fallbackDistance = Number.isFinite(fallbackStart)
          ? Math.abs(start - fallbackStart)
          : 0;
        const lengthDistance = expectedLength
          ? Math.abs(spanLength - expectedLength)
          : 0;
        const score = fallbackDistance + lengthDistance * 0.6;

        pairCandidates.push({
          start,
          end: afterIdx,
          score,
        });
      }
    }

    if (pairCandidates.length > 0) {
      pairCandidates.sort((a, b) => a.score - b.score);
      const best = pairCandidates[0];
      const bestSpan = best.end - best.start;
      const maxAllowedSpan =
        expectedLength > 0 ? expectedLength * 4 + 120 : 800;

      if (bestSpan <= maxAllowedSpan) {
        return {
          start: best.start,
          end: best.end,
          method: "context-only",
          isUnique: pairCandidates.length === 1,
          candidateCount: pairCandidates.length,
        };
      }
    }
  }

  if (beforeStarts.length > 0) {
    let nearestStart = beforeStarts[0];
    let minDistance = Number.isFinite(fallbackStart)
      ? Math.abs(nearestStart - fallbackStart)
      : 0;

    for (let i = 1; i < beforeStarts.length; i += 1) {
      const candidateStart = beforeStarts[i];
      const distance = Number.isFinite(fallbackStart)
        ? Math.abs(candidateStart - fallbackStart)
        : 0;
      if (distance < minDistance) {
        nearestStart = candidateStart;
        minDistance = distance;
      }
    }

    const end = Math.min(
      text.length,
      nearestStart + Math.max(expectedLength, 1),
    );
    if (end >= nearestStart) {
      return {
        start: nearestStart,
        end,
        method: "context-only-partial",
        isUnique: beforeStarts.length === 1,
        candidateCount: beforeStarts.length,
      };
    }
  }

  if (afterStarts.length > 0) {
    let nearestAfter = afterStarts[0];
    let minDistance = Number.isFinite(fallbackEnd)
      ? Math.abs(nearestAfter - fallbackEnd)
      : 0;

    for (let i = 1; i < afterStarts.length; i += 1) {
      const candidateAfter = afterStarts[i];
      const distance = Number.isFinite(fallbackEnd)
        ? Math.abs(candidateAfter - fallbackEnd)
        : 0;
      if (distance < minDistance) {
        nearestAfter = candidateAfter;
        minDistance = distance;
      }
    }

    const start = Math.max(0, nearestAfter - Math.max(expectedLength, 1));
    if (nearestAfter >= start) {
      return {
        start,
        end: nearestAfter,
        method: "context-only-partial",
        isUnique: afterStarts.length === 1,
        candidateCount: afterStarts.length,
      };
    }
  }

  return {
    start: Number.isFinite(fallbackStart) ? fallbackStart : -1,
    end: Number.isFinite(fallbackEnd) ? fallbackEnd : -1,
    method: "fallback-index",
    isUnique: false,
    candidateCount: 0,
  };
}

function markdownToPlainText(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizedTextForDiff(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function extractOutsideSlices(text, start, end) {
  const source = String(text || "");
  const safeStart = Math.max(0, Math.min(source.length, start));
  const safeEnd = Math.max(safeStart, Math.min(source.length, end));

  return {
    before: source.slice(0, safeStart),
    after: source.slice(safeEnd),
  };
}

function charDiffRatio(base, candidate) {
  const a = normalizedTextForDiff(base);
  const b = normalizedTextForDiff(candidate);
  const maxLen = Math.max(a.length, b.length, 1);
  const minLen = Math.min(a.length, b.length);

  let diffCount = Math.abs(a.length - b.length);
  for (let i = 0; i < minLen; i += 1) {
    if (a[i] !== b[i]) {
      diffCount += 1;
    }
  }

  return diffCount / maxLen;
}

function calcOutsideDiffRatio(
  originalPlain,
  candidatePlain,
  selectedStart,
  selectedEnd,
  candidateSelectedStart,
  candidateSelectedEnd,
) {
  const hasCandidateRange =
    Number.isFinite(candidateSelectedStart) &&
    Number.isFinite(candidateSelectedEnd) &&
    candidateSelectedEnd >= candidateSelectedStart;

  const totalLengthDelta =
    String(candidatePlain || "").length - String(originalPlain || "").length;
  const fallbackCandidateEnd = selectedEnd + totalLengthDelta;
  const effectiveCandidateStart = hasCandidateRange
    ? candidateSelectedStart
    : selectedStart;
  const effectiveCandidateEnd = hasCandidateRange
    ? candidateSelectedEnd
    : fallbackCandidateEnd;

  const originalSlices = extractOutsideSlices(
    originalPlain,
    selectedStart,
    selectedEnd,
  );
  const candidateSlices = extractOutsideSlices(
    candidatePlain,
    effectiveCandidateStart,
    effectiveCandidateEnd,
  );

  const beforeOriginal = originalSlices.before.slice(-1200);
  const beforeCandidate = candidateSlices.before.slice(-1200);
  const afterOriginal = originalSlices.after.slice(0, 1200);
  const afterCandidate = candidateSlices.after.slice(0, 1200);

  const beforeRatio = charDiffRatio(beforeOriginal, beforeCandidate);
  const afterRatio = charDiffRatio(afterOriginal, afterCandidate);

  const beforeWeight = Math.max(
    beforeOriginal.length,
    beforeCandidate.length,
    1,
  );
  const afterWeight = Math.max(afterOriginal.length, afterCandidate.length, 1);
  const totalWeight = beforeWeight + afterWeight;

  return (beforeRatio * beforeWeight + afterRatio * afterWeight) / totalWeight;
}

function getOutsideDiffThreshold(markdownText) {
  const markdownCount = countMarkdownTokens(markdownText);
  return markdownCount >= 6 ? 0.09 : 0.12;
}

function buildGuardError(code, message, hint, details = {}) {
  const error = new Error(message);
  error.status = 422;
  error.code = code;
  error.hint = hint;
  error.details = details;
  return error;
}

function countMarkdownTokens(text) {
  const normalized = String(text || "");
  if (!normalized) {
    return 0;
  }

  const patterns = [
    /^\s{0,3}#{1,6}\s+/gm,
    /^\s*[-*+]\s+/gm,
    /\*\*[^*]+\*\*/g,
    /^\s*>\s+/gm,
    /```/g,
    /`[^`]+`/g,
  ];
  return patterns.reduce(
    (sum, regex) => sum + (normalized.match(regex) || []).length,
    0,
  );
}

function isMarkdownStructureUnexpectedlyDropped(original, candidate) {
  const originalCount = countMarkdownTokens(original);
  if (originalCount < 2) {
    return false;
  }

  const candidateCount = countMarkdownTokens(candidate);
  return candidateCount < Math.floor(originalCount * 0.35);
}

async function ensureFullAndCompleteComment({
  draftComment,
  fullComment,
  plainSnapshot,
  selectedStart,
  selectedEnd,
  selectedText,
  plainContextBefore,
  plainContextAfter,
  prompt,
  geminiClient,
}) {
  const originalPlain = String(
    plainSnapshot || markdownToPlainText(fullComment),
  );
  const outsideThreshold = getOutsideDiffThreshold(fullComment);

  const validateCandidate = (candidateText) => {
    const candidatePlain = markdownToPlainText(candidateText);
    let candidatePosition = locateSelectedSpanByAnchors(
      candidatePlain,
      selectedText,
      plainContextBefore,
      plainContextAfter,
      selectedStart,
      selectedEnd,
    );

    if (candidatePosition.method === "fallback-index") {
      candidatePosition = locateSpanByContextsOnly(
        candidatePlain,
        plainContextBefore,
        plainContextAfter,
        selectedStart,
        selectedEnd,
      );
    }

    const anchoredOutsideDiffRatio = calcOutsideDiffRatio(
      originalPlain,
      candidatePlain,
      selectedStart,
      selectedEnd,
      candidatePosition.start,
      candidatePosition.end,
    );
    const fallbackOutsideDiffRatio = calcOutsideDiffRatio(
      originalPlain,
      candidatePlain,
      selectedStart,
      selectedEnd,
    );
    const useMinOutsideDiff = candidatePosition.method !== "anchor-exact";
    const outsideDiffRatio = useMinOutsideDiff
      ? Math.min(anchoredOutsideDiffRatio, fallbackOutsideDiffRatio)
      : anchoredOutsideDiffRatio;

    const valid =
      isLikelyFullComment(candidateText, fullComment) &&
      hasCompleteEnding(candidateText) &&
      !isMarkdownStructureUnexpectedlyDropped(fullComment, candidateText) &&
      outsideDiffRatio <= outsideThreshold;

    return {
      valid,
      outsideDiffRatio,
      anchoredOutsideDiffRatio,
      fallbackOutsideDiffRatio,
      outsideThreshold,
      candidateSelectionMethod: candidatePosition.method,
      candidateSelectionIsUnique: candidatePosition.isUnique,
      candidateSelectionCount: candidatePosition.candidateCount,
      markdownDropped: isMarkdownStructureUnexpectedlyDropped(
        fullComment,
        candidateText,
      ),
      completeEnding: hasCompleteEnding(candidateText),
      fullEnough: isLikelyFullComment(candidateText, fullComment),
    };
  };

  const firstPass = String(draftComment || "").trim();
  const firstValidation = validateCandidate(firstPass);

  if (firstValidation.valid) {
    return {
      content: firstPass,
      retries: 0,
      outsideDiffRatio: firstValidation.outsideDiffRatio,
    };
  }

  const retryPrompt = `${prompt}\n\n【重要補充】\n上一版輸出未通過一致性檢查。\n請重新輸出「完整評論全文」，且必須同時滿足：\n1. 僅可修改選取段落，選取範圍外不得大幅改寫或刪除。\n2. 保留原有 Markdown 結構（標題、清單、粗體、引用、程式區塊）。\n3. 最後一句必須完整收束，不得中途截斷。`;

  try {
    const retryComment = await geminiClient.generateResponse(retryPrompt);
    const secondPass = String(retryComment || "").trim();
    const secondValidation = validateCandidate(secondPass);

    if (secondValidation.valid) {
      return {
        content: secondPass,
        retries: 1,
        outsideDiffRatio: secondValidation.outsideDiffRatio,
      };
    }

    // 僅結尾不完整時，先嘗試修補尾句，避免過度拒收
    if (
      secondValidation.fullEnough &&
      !secondValidation.completeEnding &&
      !secondValidation.markdownDropped
    ) {
      const repairedPass = await repairIncompleteEnding(
        secondPass,
        geminiClient,
      );
      const repairedValidation = validateCandidate(repairedPass);

      if (repairedValidation.valid) {
        return {
          content: repairedPass,
          retries: 2,
          outsideDiffRatio: repairedValidation.outsideDiffRatio,
        };
      }
    }

    if (!secondValidation.fullEnough) {
      throw buildGuardError(
        "INCOMPLETE_OUTPUT",
        "修改結果未通過完整性檢查，請重新選取後再試。",
        "請選取更明確段落並提供具體修改指示。",
        {
          ...secondValidation,
          retries: 1,
        },
      );
    }

    if (!secondValidation.completeEnding) {
      throw buildGuardError(
        "INCOMPLETE_OUTPUT",
        "修改結果結尾不完整，已拒收本次修改。",
        "請重新嘗試，或縮小修改範圍。",
        {
          ...secondValidation,
          retries: 1,
        },
      );
    }

    if (secondValidation.markdownDropped) {
      throw buildGuardError(
        "MARKDOWN_DROPPED",
        "修改結果造成 Markdown 結構流失，已拒收本次修改。",
        "請重新選取較小範圍並重試。",
        secondValidation,
      );
    }

    if (
      secondValidation.fullEnough &&
      secondValidation.completeEnding &&
      !secondValidation.markdownDropped
    ) {
      const containmentPrompt = `${prompt}\n\n【最後保底規則（必須遵守）】\n上一版僅在「選取範圍外差異」超標。\n請重做一次，並嚴格遵守：\n1. 只允許修改選取段落。\n2. 選取段落以外文字必須盡可能逐字維持不變，不得改寫、不重排。\n3. 必須輸出完整評論全文，保持既有 Markdown 結構。\n4. 最後一句完整收束。`;

      try {
        const containmentComment =
          await geminiClient.generateResponse(containmentPrompt);
        const containmentPass = String(containmentComment || "").trim();
        const containmentValidation = validateCandidate(containmentPass);

        if (containmentValidation.valid) {
          return {
            content: containmentPass,
            retries: 2,
            outsideDiffRatio: containmentValidation.outsideDiffRatio,
          };
        }
      } catch (error) {
        console.warn("outside-only 保底重試失敗:", error.message);
      }
    }

    throw buildGuardError(
      "OUTSIDE_DIFF_TOO_HIGH",
      "修改結果影響到選取範圍外內容，已拒收本次修改。",
      "請縮小選取範圍，或把修改指示寫得更聚焦。",
      {
        ...secondValidation,
        retries: 2,
      },
    );
  } catch (error) {
    if (error?.status === 422) {
      throw error;
    }

    console.warn("modify-comment 重試生成失敗:", error.message);
  }

  throw buildGuardError(
    "MODIFY_GUARD_RETRY_FAILED",
    "修改結果未通過一致性檢查，且重試失敗。",
    "請稍後再試，或縮小選取範圍。",
    {
      retries: 1,
      outsideDiffRatio: firstValidation.outsideDiffRatio,
      outsideThreshold,
    },
  );
}

module.exports = router;
