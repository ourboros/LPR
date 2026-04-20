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

      for (const sourceId of safeSelectedSources) {
        const lesson = await safeFindLessonById(sourceId, req);
        if (lesson) {
          lessonSections.push(`【${lesson.name}】\n${lesson.content}`);
        }
      }

      lessonContent = lessonSections.join("\n\n");
    }

    if (normalizedMode === "summary" && !lessonContent) {
      return res.status(400).json({
        error: "找不到可用的教案內容，請重新選擇教案後再試一次",
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

    // 更新對話歷史
    history.push({ role: "user", content: message });
    history.push(response);
    sessions.set(sid, history);

    const savedReview = await persistReviewRecord({
      lessonId: safeSelectedSources[0] || null,
      sessionId: req.user ? null : req.sessionId || null,
      userId: req.user?.id || null,
      mode: normalizedMode,
      action: normalizedAction,
      userPrompt: message,
      aiContent: response.content,
      sources: response.sources,
    });

    // 回傳結果
    res.json({
      ...response,
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
      mode: "quick-action",
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
      mode: "quick-action",
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
      mode: "quick-action",
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

    // 建構 AI 提示詞
    const prompt = `你是專業的教育教案評論修改助手。
請根據以下資訊，對完整評論進行局部修正並輸出完整評論全文：

【完整原評論】
${normalizedFullComment}

【使用者選取的段落】
${normalizedSelectedText}

【選取範圍位置】
起始索引：${Number.isFinite(normalizedSelectionStart) ? normalizedSelectionStart : "未知"}
結束索引：${Number.isFinite(normalizedSelectionEnd) ? normalizedSelectionEnd : "未知"}

【選取段落前文錨點】
${normalizedPlainContextBefore || "（無）"}

【選取段落後文錨點】
${normalizedPlainContextAfter || "（無）"}

【伺服器推定純文字位置】
起始索引：${Number.isFinite(plainPosition.start) ? plainPosition.start : "未知"}
結束索引：${Number.isFinite(plainPosition.end) ? plainPosition.end : "未知"}

【修改指示】
${instruction}

【要求】
1. 保持專業教育評論風格
2. 僅針對選取段落做必要調整，其他段落盡量維持原意與結構
3. 必須輸出「完整評論全文」，不可只輸出局部段落
4. 不限制輸出字數，以完整性、連貫性與可讀性優先
5. 每個段落都必須完整收尾，最後一句不得中途截斷
6. 保留原有 Markdown 結構（標題、清單、粗體、引用、程式區塊）
7. 選取範圍以外的內容不得大幅改寫、刪除或重排
8. 不要加入任何前綴或說明文字（例如：修改後評論）

請直接輸出最終完整評論全文：`;

    // 呼叫 Gemini API
    const geminiClient = require("../services/geminiClient");
    const draftComment = await geminiClient.generateResponse(prompt);
    const guardResult = await ensureFullAndCompleteComment({
      draftComment,
      fullComment: normalizedFullComment,
      plainSnapshot: normalizedPlainSnapshot,
      selectedStart: plainPosition.start,
      selectedEnd: plainPosition.end,
      prompt,
      geminiClient,
    });
    const modifiedComment = guardResult.content;

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
        method: plainPosition.method,
        isUnique: plainPosition.isUnique,
        candidateCount: plainPosition.candidateCount,
        outsideDiffRatio: guardResult.outsideDiffRatio,
        retries: guardResult.retries,
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
    const lessonId = normalizeLessonId(payload.lessonId);
    if (!lessonId || !payload.aiContent) {
      return null;
    }

    const lesson = await findLessonById(lessonId, {
      user: payload.userId ? { id: payload.userId } : null,
      sessionId: payload.sessionId || null,
    });
    if (!lesson) {
      return;
    }

    const reviewId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    return await ReviewRecord.create({
      reviewId,
      lessonId,
      contentHash: lesson.contentHash || "",
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
    console.warn("儲存評論紀錄失敗，略過不影響主流程:", error.message);
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

function hasCompleteEnding(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return false;
  }

  return /[。！？.!?」』）)]\s*$/.test(normalized);
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
) {
  const originalSlices = extractOutsideSlices(
    originalPlain,
    selectedStart,
    selectedEnd,
  );
  const candidateSlices = extractOutsideSlices(
    candidatePlain,
    selectedStart,
    selectedEnd,
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
  return markdownCount >= 6 ? 0.05 : 0.08;
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
  prompt,
  geminiClient,
}) {
  const originalPlain = String(
    plainSnapshot || markdownToPlainText(fullComment),
  );
  const outsideThreshold = getOutsideDiffThreshold(fullComment);

  const validateCandidate = (candidateText) => {
    const candidatePlain = markdownToPlainText(candidateText);
    const outsideDiffRatio = calcOutsideDiffRatio(
      originalPlain,
      candidatePlain,
      selectedStart,
      selectedEnd,
    );
    const valid =
      isLikelyFullComment(candidateText, fullComment) &&
      hasCompleteEnding(candidateText) &&
      !isMarkdownStructureUnexpectedlyDropped(fullComment, candidateText) &&
      outsideDiffRatio <= outsideThreshold;

    return {
      valid,
      outsideDiffRatio,
      outsideThreshold,
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

    if (!secondValidation.fullEnough) {
      throw buildGuardError(
        "INCOMPLETE_OUTPUT",
        "修改結果未通過完整性檢查，請重新選取後再試。",
        "請選取更明確段落並提供具體修改指示。",
        secondValidation,
      );
    }

    if (!secondValidation.completeEnding) {
      throw buildGuardError(
        "INCOMPLETE_OUTPUT",
        "修改結果結尾不完整，已拒收本次修改。",
        "請重新嘗試，或縮小修改範圍。",
        secondValidation,
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

    throw buildGuardError(
      "OUTSIDE_DIFF_TOO_HIGH",
      "修改結果影響到選取範圍外內容，已拒收本次修改。",
      "請縮小選取範圍，或把修改指示寫得更聚焦。",
      secondValidation,
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
