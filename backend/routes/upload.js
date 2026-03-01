// ============================================
// 檔案上傳路由
// ============================================

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fileParser = require("../services/fileParser");

// 修正中文檔名編碼問題
function decodeFilename(filename) {
  return Buffer.from(filename, "latin1").toString("utf8");
}

// 確保上傳目錄存在
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `lesson-${uniqueSuffix}${ext}`);
  },
});

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
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// 取得 lessonStore（從 chat 路由共享）
const chatRouter = require("./chat");
const lessonStore = chatRouter.lessonStore;

/**
 * POST /api/upload
 * 上傳單一教案檔案
 */
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "請提供檔案" });
    }

    const filePath = req.file.path;
    const mimeType = req.file.mimetype;

    // 解析檔案內容
    const extractedText = await fileParser.parseFile(filePath, mimeType);

    if (!extractedText || extractedText.length === 0) {
      return res.status(400).json({ error: "無法從檔案中提取文本內容" });
    }

    // 建立教案記錄
    const lessonId = Date.now() + Math.random();
    const lesson = {
      id: lessonId,
      name: decodeFilename(req.file.originalname),
      filename: req.file.filename,
      type: req.file.mimetype,
      size: req.file.size,
      uploadDate: new Date().toISOString(),
      content: extractedText,
      selected: false,
    };

    // 儲存至記憶體
    lessonStore.set(lessonId, lesson);

    // 回傳結果（不包含完整 content）
    res.json({
      id: lesson.id,
      name: lesson.name,
      type: lesson.type,
      size: lesson.size,
      uploadDate: lesson.uploadDate,
      contentLength: extractedText.length,
      message: "檔案上傳成功",
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
        const filePath = file.path;
        const mimeType = file.mimetype;

        // 解析檔案內容
        const extractedText = await fileParser.parseFile(filePath, mimeType);

        if (!extractedText || extractedText.length === 0) {
          errors.push({
            filename: file.originalname,
            error: "無法提取文本內容",
          });
          continue;
        }

        // 建立教案記錄
        const lessonId = Date.now() + Math.random();
        const lesson = {
          id: lessonId,
          name: decodeFilename(file.originalname),
          filename: file.filename,
          type: file.mimetype,
          size: file.size,
          uploadDate: new Date().toISOString(),
          content: extractedText,
          selected: false,
        };

        lessonStore.set(lessonId, lesson);

        results.push({
          id: lesson.id,
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
router.get("/lessons", (req, res) => {
  try {
    const lessons = Array.from(lessonStore.values()).map((lesson) => ({
      id: lesson.id,
      name: lesson.name,
      type: lesson.type,
      size: lesson.size,
      uploadDate: lesson.uploadDate,
      contentLength: lesson.content?.length || 0,
    }));

    res.json(lessons);
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
router.get("/lesson/:id", (req, res) => {
  try {
    const lessonId = parseFloat(req.params.id);
    const lesson = lessonStore.get(lessonId);

    if (!lesson) {
      return res.status(404).json({ error: "找不到指定的教案" });
    }

    res.json(lesson);
  } catch (error) {
    console.error("取得教案內容錯誤:", error);
    res.status(500).json({
      error: "取得教案內容時發生錯誤",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/upload/lesson/:id
 * 刪除教案
 */
router.delete("/lesson/:id", (req, res) => {
  try {
    const lessonId = parseFloat(req.params.id);
    const lesson = lessonStore.get(lessonId);

    if (!lesson) {
      return res.status(404).json({ error: "找不到指定的教案" });
    }

    // 刪除實體檔案
    const filePath = path.join(uploadDir, lesson.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 從記憶體中移除
    lessonStore.delete(lessonId);

    res.json({ message: "教案已刪除" });
  } catch (error) {
    console.error("刪除教案錯誤:", error);
    res.status(500).json({
      error: "刪除教案時發生錯誤",
      message: error.message,
    });
  }
});

module.exports = router;
