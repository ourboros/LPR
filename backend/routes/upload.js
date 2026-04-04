// ============================================
// 檔案上傳路由
// ============================================

const express = require("express");
const router = express.Router();
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

function normalizeLessonId(rawLessonId) {
  const lessonId = Number.parseFloat(rawLessonId);
  if (!Number.isFinite(lessonId)) {
    return null;
  }

  return lessonId;
}

async function resolveHistoryLessonIds(lesson) {
  if (!lesson) {
    return [];
  }

  const canonicalLessonId = lesson.canonicalLessonId || lesson.lessonId;
  const relatedLessons = await Lesson.find(
    {
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

async function buildHistorySummary(lessonIds = []) {
  if (!lessonIds || lessonIds.length === 0) {
    return {
      reviewCount: 0,
      scoreCount: 0,
      latestReviewedAt: null,
    };
  }

  const [reviewCount, scoreCount, latestReview] = await Promise.all([
    ReviewRecord.countDocuments({
      lessonId: { $in: lessonIds },
      deletedAt: null,
    }),
    Score.countDocuments({ lessonId: { $in: lessonIds } }),
    ReviewRecord.findOne(
      {
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
router.post("/", upload.single("file"), async (req, res) => {
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

    const duplicateResult = await findDuplicateLessons(Lesson, {
      normalizedName,
      contentHash,
      type: req.file.mimetype,
      size: req.file.size,
    });

    const matchedLessons = duplicateResult.matchedLessons || [];
    const canonicalLessonId = duplicateResult.isDuplicate
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
    });

    const matchedLessonIds = matchedLessons.map((item) => item.lessonId);
    const historySummary = await buildHistorySummary(matchedLessonIds);

    // 回傳結果（不包含完整 content）
    res.json({
      id: lesson.lessonId,
      name: lesson.name,
      type: lesson.type,
      size: lesson.size,
      uploadDate: lesson.uploadDate,
      contentLength: extractedText.length,
      message: "檔案上傳成功",
      duplicateDecisionRequired: duplicateResult.isDuplicate,
      isDuplicate: duplicateResult.isDuplicate,
      matchType: duplicateResult.matchType,
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
});

/**
 * POST /api/upload/multiple
 * 上傳多個教案檔案
 */
router.post("/multiple", upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "請提供至少一個檔案" });
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
});

/**
 * GET /api/upload/lessons
 * 取得所有已上傳的教案列表
 */
router.get("/lessons", async (req, res) => {
  try {
    const lessons = await Lesson.find({}, { _id: 0, __v: 0 })
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
});

/**
 * GET /api/upload/lesson/:id
 * 取得特定教案的完整內容
 */
router.get("/lesson/:id", async (req, res) => {
  try {
    const lessonId = normalizeLessonId(req.params.id);

    if (!lessonId) {
      return res.status(400).json({ error: "無效的 lessonId" });
    }

    const lesson = await Lesson.findOne(
      { lessonId },
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
});

/**
 * POST /api/upload/resolve-duplicate
 * 重複教案決策：顯示舊資料或清除舊資料
 */
router.post("/resolve-duplicate", async (req, res) => {
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
      { lessonId },
      { _id: 0, __v: 0 },
    ).lean();
    if (!lesson) {
      return res.status(404).json({ error: "找不到指定教案" });
    }

    const allGroupLessonIds = await resolveHistoryLessonIds(lesson);
    const previousLessonIds = allGroupLessonIds.filter((id) => id !== lessonId);

    if (action === "clear-history" && previousLessonIds.length > 0) {
      await Promise.all([
        Score.deleteMany({ lessonId: { $in: previousLessonIds } }),
        ReviewRecord.deleteMany({ lessonId: { $in: previousLessonIds } }),
      ]);
    }

    const historySummary = await buildHistorySummary(allGroupLessonIds);

    res.json({
      success: true,
      action,
      lessonId,
      canonicalLessonId: lesson.canonicalLessonId || lesson.lessonId,
      historySummary,
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
});

/**
 * GET /api/upload/lesson/:id/delete-preview
 * 預覽刪除會影響的資料筆數
 */
router.get("/lesson/:id/delete-preview", async (req, res) => {
  try {
    const lessonId = normalizeLessonId(req.params.id);
    if (!lessonId) {
      return res.status(400).json({ error: "無效的 lessonId" });
    }

    const scope = req.query.scope === "history" ? "history" : "current";

    const lesson = await Lesson.findOne(
      { lessonId },
      { _id: 0, __v: 0 },
    ).lean();
    if (!lesson) {
      return res.status(404).json({ error: "找不到指定的教案" });
    }

    const targetLessonIds =
      scope === "history" ? await resolveHistoryLessonIds(lesson) : [lessonId];

    const [reviewCount, scoreCount] = await Promise.all([
      ReviewRecord.countDocuments({
        lessonId: { $in: targetLessonIds },
        deletedAt: null,
      }),
      Score.countDocuments({ lessonId: { $in: targetLessonIds } }),
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
});

/**
 * DELETE /api/upload/lesson/:id
 * 刪除教案
 */
router.delete("/lesson/:id", async (req, res) => {
  try {
    const lessonId = normalizeLessonId(req.params.id);
    if (!lessonId) {
      return res.status(400).json({ error: "無效的 lessonId" });
    }

    const cascade = String(req.query.cascade || "false") === "true";
    const scope = req.query.scope === "history" ? "history" : "current";

    const lesson = await Lesson.findOne(
      { lessonId },
      { _id: 0, __v: 0 },
    ).lean();

    if (!lesson) {
      return res.status(404).json({ error: "找不到指定的教案" });
    }

    const targetLessonIds =
      scope === "history" ? await resolveHistoryLessonIds(lesson) : [lessonId];

    await Lesson.deleteMany({ lessonId: { $in: targetLessonIds } });

    if (cascade) {
      await Promise.all([
        Score.deleteMany({ lessonId: { $in: targetLessonIds } }),
        ReviewRecord.deleteMany({ lessonId: { $in: targetLessonIds } }),
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
});

module.exports = router;
