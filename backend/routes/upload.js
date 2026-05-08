// ============================================
// 檔案上傳路由
// ============================================

const express = require("express");
const router = express.Router();
const { verifyTokenMiddleware } = require("../middleware/auth");
const multer = require("multer");
const fileParser = require("../services/fileParser");
const Lesson = require("../models/Lesson");
const Score = require("../models/Score");
const ReviewRecord = require("../models/ReviewRecord");
const {
  normalizeLessonName,
  buildContentHash,
  buildSourceSignature,
  findDuplicateLessons,
} = require("../services/lessonMatcher");

// 修正中文檔名編碼問題
function decodeFilename(filename) {
  return Buffer.from(filename, "latin1").toString("utf8");
}

function generateNumericId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function generateGuestSessionId() {
  return `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function buildGuestExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  return expiresAt;
}

function buildLessonScopeFilter(req) {
  if (req.user?.id) {
    return { userId: req.user.id };
  }

  if (req.sessionId) {
    return { userId: null, sessionId: req.sessionId };
  }

  return { userId: null, sessionId: "__no_session__" };
}

function buildRecordScopeFilter(req) {
  if (req.user?.id) {
    return { userId: req.user.id };
  }

  if (req.sessionId) {
    return { userId: null, sessionId: req.sessionId };
  }

  return { userId: null, sessionId: "__no_session__" };
}

function normalizeLessonId(rawLessonId) {
  const lessonId = Number.parseFloat(rawLessonId);
  if (!Number.isFinite(lessonId)) {
    return null;
  }

  return lessonId;
}

async function resolveHistoryLessonIds(lesson, req) {
  if (!lesson) {
    return [];
  }

  const canonicalLessonId = lesson.canonicalLessonId || lesson.lessonId;
  const relatedLessons = await Lesson.find(
    {
      ...buildLessonScopeFilter(req),
      $or: [{ canonicalLessonId }, { lessonId: canonicalLessonId }],
    },
    { _id: 0, lessonId: 1 },
  ).lean();

  const lessonIds = relatedLessons.map((item) => item.lessonId);
  if (!lessonIds.includes(lesson.lessonId)) {
    lessonIds.push(lesson.lessonId);
  }

  return lessonIds;
}

async function buildHistorySummary(lessonIds = [], req) {
  if (!lessonIds || lessonIds.length === 0) {
    return {
      reviewCount: 0,
      scoreCount: 0,
      latestReviewedAt: null,
    };
  }

  const recordScopeFilter = buildRecordScopeFilter(req);

  const [reviewCount, scoreCount, latestReview] = await Promise.all([
    ReviewRecord.countDocuments({
      ...recordScopeFilter,
      lessonId: { $in: lessonIds },
      deletedAt: null,
    }),
    Score.countDocuments({
      ...recordScopeFilter,
      lessonId: { $in: lessonIds },
    }),
    ReviewRecord.findOne(
      {
        ...recordScopeFilter,
        lessonId: { $in: lessonIds },
        deletedAt: null,
      },
      { _id: 0, createdAt: 1 },
    )
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return {
    reviewCount,
    scoreCount,
    latestReviewedAt: latestReview?.createdAt || null,
  };
}

async function findTargetLessonForReuse(
  currentLessonId,
  groupLessonIds = [],
  req,
) {
  if (!Array.isArray(groupLessonIds) || groupLessonIds.length === 0) {
    return null;
  }

  const previousLessonIds = groupLessonIds.filter(
    (id) => id !== currentLessonId,
  );

  if (previousLessonIds.length === 0) {
    return null;
  }

  return Lesson.findOne(
    {
      ...buildLessonScopeFilter(req),
      lessonId: { $in: previousLessonIds },
    },
    { _id: 0, lessonId: 1, name: 1, canonicalLessonId: 1, uploadDate: 1 },
  )
    .sort({ uploadDate: -1 })
    .lean();
}

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("不支援的檔案類型。請上傳 PDF, DOC, DOCX 或 TXT 檔案。"),
      false,
    );
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/**
 * POST /api/upload
 * 上傳單一教案檔案
 */
router.post(
  "/",
  verifyTokenMiddleware({ allowGuest: true }),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "請提供檔案" });
      }

      const mimeType = req.file.mimetype;

      // 解析檔案內容
      const extractedText = await fileParser.parseFileBuffer(
        req.file.buffer,
        req.file.originalname,
        mimeType,
      );

      if (!extractedText || extractedText.length === 0) {
        return res.status(400).json({ error: "無法從檔案中提取文本內容" });
      }

      const decodedName = decodeFilename(req.file.originalname);
      const normalizedName = normalizeLessonName(decodedName);
      const contentHash = buildContentHash(extractedText);
      const sourceSignature = buildSourceSignature({
        normalizedName,
        type: req.file.mimetype,
        size: req.file.size,
      });
      const storedFilename = `${Date.now()}-${decodeFilename(req.file.originalname)}`;

      const sessionId = req.user
        ? null
        : req.sessionId || generateGuestSessionId();
      if (sessionId) {
        res.setHeader("x-session-id", sessionId);
      }

      const duplicateResult = await findDuplicateLessons(Lesson, {
        normalizedName,
        contentHash,
        type: req.file.mimetype,
        size: req.file.size,
      });

      const matchedLessons = (duplicateResult.matchedLessons || []).filter(
        (item) => {
          if (req.user?.id) {
            return item.userId === req.user.id;
          }

          return item.userId === null && item.sessionId === sessionId;
        },
      );

      const isDuplicate = matchedLessons.length > 0;
      const canonicalLessonId = isDuplicate
        ? matchedLessons[0].canonicalLessonId || matchedLessons[0].lessonId
        : null;

      // 建立教案記錄
      const lessonId = generateNumericId();

      const lesson = await Lesson.create({
        lessonId,
        name: decodedName,
        normalizedName,
        contentHash,
        sourceSignature,
        canonicalLessonId: canonicalLessonId || lessonId,
        filename: storedFilename,
        type: req.file.mimetype,
        size: req.file.size,
        uploadDate: new Date(),
        content: extractedText,
        selected: false,
        userId: req.user?.id || null,
        sessionId: sessionId,
        sessionExpiry: req.user ? null : buildGuestExpiryDate(),
      });

      const matchedLessonIds = matchedLessons.map((item) => item.lessonId);
      const historySummary = await buildHistorySummary(matchedLessonIds, req);

      // 回傳結果（不包含完整 content）
      res.json({
        id: lesson.lessonId,
        name: lesson.name,
        type: lesson.type,
        size: lesson.size,
        uploadDate: lesson.uploadDate,
        contentLength: extractedText.length,
        message: "檔案上傳成功",
        duplicateDecisionRequired: isDuplicate,
        isDuplicate,
        matchType: isDuplicate ? duplicateResult.matchType : "none",
        matchedLessons: matchedLessons.map((item) => ({
          id: item.lessonId,
          name: item.name,
          uploadDate: item.uploadDate,
          canonicalLessonId: item.canonicalLessonId || item.lessonId,
        })),
        historySummary,
      });
    } catch (error) {
      console.error("檔案上傳錯誤:", error);

      // 清理失敗的上傳檔案
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.error("清理檔案失敗:", err);
        }
      }

      res.status(500).json({
        error: "上傳檔案時發生錯誤",
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/upload/multiple
 * 上傳多個教案檔案
 */
router.post(
  "/multiple",
  verifyTokenMiddleware({ allowGuest: true }),
  upload.array("files", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "請提供至少一個檔案" });
      }

      const guestSessionId = req.user
        ? null
        : req.sessionId || generateGuestSessionId();
      if (guestSessionId) {
        res.setHeader("x-session-id", guestSessionId);
      }

      const results = [];
      const errors = [];

      for (const file of req.files) {
        try {
          const mimeType = file.mimetype;

          // 解析檔案內容
          const extractedText = await fileParser.parseFileBuffer(
            file.buffer,
            file.originalname,
            mimeType,
          );

          if (!extractedText || extractedText.length === 0) {
            errors.push({
              filename: file.originalname,
              error: "無法提取文本內容",
            });
            continue;
          }

          // 建立教案記錄
          const lessonId = generateNumericId();
          const decodedName = decodeFilename(file.originalname);
          const normalizedName = normalizeLessonName(decodedName);
          const contentHash = buildContentHash(extractedText);
          const sourceSignature = buildSourceSignature({
            normalizedName,
            type: file.mimetype,
            size: file.size,
          });
          const storedFilename = `${Date.now()}-${decodeFilename(file.originalname)}`;
          const lesson = await Lesson.create({
            lessonId,
            name: decodedName,
            normalizedName,
            contentHash,
            sourceSignature,
            canonicalLessonId: lessonId,
            filename: storedFilename,
            type: file.mimetype,
            size: file.size,
            uploadDate: new Date(),
            content: extractedText,
            selected: false,
            userId: req.user?.id || null,
            sessionId: guestSessionId,
            sessionExpiry: req.user ? null : buildGuestExpiryDate(),
          });

          results.push({
            id: lesson.lessonId,
            name: lesson.name,
            type: lesson.type,
            size: lesson.size,
            uploadDate: lesson.uploadDate,
            contentLength: extractedText.length,
          });
        } catch (error) {
          console.error(`處理檔案 ${file.originalname} 時發生錯誤:`, error);
          errors.push({ filename: file.originalname, error: error.message });
        }
      }

      res.json({
        message: `成功上傳 ${results.length} 個檔案`,
        success: results,
        errors: errors,
      });
    } catch (error) {
      console.error("批次上傳錯誤:", error);
      res.status(500).json({
        error: "批次上傳時發生錯誤",
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/upload/lessons
 * 取得所有已上傳的教案列表
 */
router.get(
  "/lessons",
  verifyTokenMiddleware({ allowGuest: true }),
  async (req, res) => {
    try {
      const lessons = await Lesson.find(buildLessonScopeFilter(req), {
        _id: 0,
        __v: 0,
      })
        .sort({ uploadDate: -1 })
        .lean();

      const formattedLessons = lessons.map((lesson) => ({
        id: lesson.lessonId,
        name: lesson.name,
        type: lesson.type,
        size: lesson.size,
        uploadDate: lesson.uploadDate,
        contentLength: lesson.content?.length || 0,
      }));

      res.json(formattedLessons);
    } catch (error) {
      console.error("取得教案列表錯誤:", error);
      res.status(500).json({
        error: "取得教案列表時發生錯誤",
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/upload/lesson/:id
 * 取得特定教案的完整內容
 */
router.get(
  "/lesson/:id",
  verifyTokenMiddleware({ allowGuest: true }),
  async (req, res) => {
    try {
      const lessonId = normalizeLessonId(req.params.id);

      if (!lessonId) {
        return res.status(400).json({ error: "無效的 lessonId" });
      }

      const lesson = await Lesson.findOne(
        { ...buildLessonScopeFilter(req), lessonId },
        { _id: 0, __v: 0 },
      ).lean();

      if (!lesson) {
        return res.status(404).json({ error: "找不到指定的教案" });
      }

      res.json({
        id: lesson.lessonId,
        name: lesson.name,
        filename: lesson.filename,
        type: lesson.type,
        size: lesson.size,
        uploadDate: lesson.uploadDate,
        content: lesson.content,
        selected: lesson.selected,
        canonicalLessonId: lesson.canonicalLessonId || lesson.lessonId,
        contentHash: lesson.contentHash || "",
      });
    } catch (error) {
      console.error("取得教案內容錯誤:", error);
      res.status(500).json({
        error: "取得教案內容時發生錯誤",
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/upload/resolve-duplicate
 * 重複教案決策：顯示舊資料或清除舊資料
 */
router.post(
  "/resolve-duplicate",
  verifyTokenMiddleware({ allowGuest: true }),
  async (req, res) => {
    try {
      const { newLessonId, action } = req.body;
      const lessonId = normalizeLessonId(newLessonId);

      if (!lessonId) {
        return res.status(400).json({ error: "請提供有效的 newLessonId" });
      }

      if (!["reuse-history", "clear-history"].includes(action)) {
        return res
          .status(400)
          .json({ error: "action 必須為 reuse-history 或 clear-history" });
      }

      const lesson = await Lesson.findOne(
        { ...buildLessonScopeFilter(req), lessonId },
        { _id: 0, __v: 0 },
      ).lean();
      if (!lesson) {
        return res.status(404).json({ error: "找不到指定教案" });
      }

      const allGroupLessonIds = await resolveHistoryLessonIds(lesson, req);
      const previousLessonIds = allGroupLessonIds.filter(
        (id) => id !== lessonId,
      );

      let targetLesson = null;

      if (action === "reuse-history") {
        targetLesson = await findTargetLessonForReuse(
          lessonId,
          allGroupLessonIds,
          req,
        );

        if (!targetLesson) {
          return res.status(409).json({
            success: false,
            error: "找不到可用的歷史教案",
            message: "目前沒有可重用的歷史教案，請改用新上傳教案或重新上傳。",
            targetFound: false,
          });
        }
      }

      if (action === "clear-history" && previousLessonIds.length > 0) {
        // ✅ 改進：同時刪除 Score、ReviewRecord 和 Lesson 記錄
        const deleteResults = await Promise.all([
          Score.deleteMany({
            ...buildRecordScopeFilter(req),
            lessonId: { $in: previousLessonIds },
          }),
          ReviewRecord.deleteMany({
            ...buildRecordScopeFilter(req),
            lessonId: { $in: previousLessonIds },
          }),
          // ✅ 新增：刪除舊的 Lesson 記錄
          Lesson.deleteMany({
            ...buildLessonScopeFilter(req),
            lessonId: { $in: previousLessonIds },
          }),
        ]);

        console.info(`[清除教案] 已刪除舊教案及相關記錄`, {
          action,
          previousLessonIds,
          deletedScores: deleteResults[0].deletedCount,
          deletedReviews: deleteResults[1].deletedCount,
          deletedLessons: deleteResults[2].deletedCount,
        });

        targetLesson = lesson;
      }

      if (action === "clear-history" && !targetLesson) {
        targetLesson = lesson;
      }

      const historySummary = await buildHistorySummary(allGroupLessonIds, req);

      res.json({
        success: true,
        action,
        lessonId,
        canonicalLessonId: lesson.canonicalLessonId || lesson.lessonId,
        historySummary,
        targetFound: Boolean(targetLesson),
        targetLessonId: targetLesson?.lessonId || null,
        targetLessonName: targetLesson?.name || null,
        targetCanonicalLessonId:
          targetLesson?.canonicalLessonId || targetLesson?.lessonId || null,
        affectedLessonIds: action === "clear-history" ? previousLessonIds : [],
        message:
          action === "clear-history"
            ? "已清除先前同份教案的評論與評分紀錄"
            : "已保留並顯示先前同份教案資料",
      });
    } catch (error) {
      console.error("處理重複教案決策錯誤:", error);
      res.status(500).json({
        error: "處理重複教案決策時發生錯誤",
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/upload/lesson/:id/delete-preview
 * 預覽刪除會影響的資料筆數
 */
router.get(
  "/lesson/:id/delete-preview",
  verifyTokenMiddleware({ allowGuest: true }),
  async (req, res) => {
    try {
      const lessonId = normalizeLessonId(req.params.id);
      if (!lessonId) {
        return res.status(400).json({ error: "無效的 lessonId" });
      }

      const scope = req.query.scope === "history" ? "history" : "current";

      const lesson = await Lesson.findOne(
        { ...buildLessonScopeFilter(req), lessonId },
        { _id: 0, __v: 0 },
      ).lean();
      if (!lesson) {
        return res.status(404).json({ error: "找不到指定的教案" });
      }

      const targetLessonIds =
        scope === "history"
          ? await resolveHistoryLessonIds(lesson, req)
          : [lessonId];

      const recordScopeFilter = buildRecordScopeFilter(req);

      const [reviewCount, scoreCount] = await Promise.all([
        ReviewRecord.countDocuments({
          ...recordScopeFilter,
          lessonId: { $in: targetLessonIds },
          deletedAt: null,
        }),
        Score.countDocuments({
          ...recordScopeFilter,
          lessonId: { $in: targetLessonIds },
        }),
      ]);

      res.json({
        scope,
        lessonIds: targetLessonIds,
        lessonCount: targetLessonIds.length,
        reviewCount,
        scoreCount,
        fileCount: 0,
      });
    } catch (error) {
      console.error("刪除預覽錯誤:", error);
      res.status(500).json({
        error: "刪除預覽時發生錯誤",
        message: error.message,
      });
    }
  },
);

/**
 * DELETE /api/upload/lesson/:id
 * 刪除教案
 */
router.delete(
  "/lesson/:id",
  verifyTokenMiddleware({ allowGuest: true }),
  async (req, res) => {
    try {
      const lessonId = normalizeLessonId(req.params.id);
      if (!lessonId) {
        return res.status(400).json({ error: "無效的 lessonId" });
      }

      const cascade = String(req.query.cascade || "false") === "true";
      const scope = req.query.scope === "history" ? "history" : "current";

      const lesson = await Lesson.findOne(
        { ...buildLessonScopeFilter(req), lessonId },
        { _id: 0, __v: 0 },
      ).lean();

      if (!lesson) {
        return res.status(404).json({ error: "找不到指定的教案" });
      }

      const targetLessonIds =
        scope === "history"
          ? await resolveHistoryLessonIds(lesson, req)
          : [lessonId];

      await Lesson.deleteMany({
        ...buildLessonScopeFilter(req),
        lessonId: { $in: targetLessonIds },
      });

      const recordScopeFilter = buildRecordScopeFilter(req);

      if (cascade) {
        await Promise.all([
          Score.deleteMany({
            ...recordScopeFilter,
            lessonId: { $in: targetLessonIds },
          }),
          ReviewRecord.deleteMany({
            ...recordScopeFilter,
            lessonId: { $in: targetLessonIds },
          }),
        ]);
      }

      res.json({
        success: true,
        message: "教案已刪除",
        lessonIds: targetLessonIds,
        cascade,
        scope,
      });
    } catch (error) {
      console.error("刪除教案錯誤:", error);
      res.status(500).json({
        error: "刪除教案時發生錯誤",
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/upload/guest-session/close
 * 未登入使用者離開頁面時，立即清除該 guest session 資料
 */
router.post(
  "/guest-session/close",
  verifyTokenMiddleware({ allowGuest: true }),
  async (req, res) => {
    try {
      if (req.user?.id) {
        return res.json({
          success: true,
          message: "已登入使用者不執行 guest 清理",
          deletedLessons: 0,
          deletedReviews: 0,
          deletedScores: 0,
        });
      }

      const sessionId = String(
        req.body?.sessionId || req.sessionId || "",
      ).trim();
      if (!sessionId) {
        return res.status(400).json({ error: "缺少 guest sessionId" });
      }

      const lessons = await Lesson.find(
        { userId: null, sessionId },
        { _id: 0, lessonId: 1 },
      ).lean();

      const lessonIds = lessons.map((item) => item.lessonId);

      const [lessonDeleteResult, reviewDeleteResult, scoreDeleteResult] =
        await Promise.all([
          Lesson.deleteMany({ userId: null, sessionId }),
          ReviewRecord.deleteMany({
            userId: null,
            $or: [{ sessionId }, { lessonId: { $in: lessonIds } }],
          }),
          Score.deleteMany({
            userId: null,
            $or: [{ sessionId }, { lessonId: { $in: lessonIds } }],
          }),
        ]);

      return res.json({
        success: true,
        message: "guest session 資料已清除",
        deletedLessons: lessonDeleteResult.deletedCount,
        deletedReviews: reviewDeleteResult.deletedCount,
        deletedScores: scoreDeleteResult.deletedCount,
      });
    } catch (error) {
      console.error("清除 guest session 錯誤:", error);
      return res.status(500).json({
        error: "清除 guest session 時發生錯誤",
        message: error.message,
      });
    }
  },
);

module.exports = router;
