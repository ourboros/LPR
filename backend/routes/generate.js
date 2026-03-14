// ============================================
// 生成內容路由 - 處理各類內容生成
// ============================================

const express = require("express");
const router = express.Router();
const ragService = require("../services/rag-simple");
const Lesson = require("../models/Lesson");

/**
 * POST /api/generate
 * 統一的內容生成接口
 */
router.post("/", async (req, res) => {
  try {
    const { action, lessonId, scores } = req.body;

    if (!action) {
      return res.status(400).json({ error: "請提供生成動作類型" });
    }

    switch (action) {
      case "summary":
        return await generateSummary(req, res, lessonId);

      case "rubric":
        return await generateRubric(req, res, lessonId);

      case "mindmap":
        return await generateMindmap(req, res, lessonId);

      case "report":
        return await generateReport(req, res, lessonId, scores);

      default:
        return res.status(400).json({ error: "不支援的生成動作類型" });
    }
  } catch (error) {
    console.error("生成內容錯誤:", error);
    res.status(500).json({
      error: "生成內容時發生錯誤",
      message: error.message,
    });
  }
});

/**
 * 生成教案摘要
 */
async function generateSummary(req, res, lessonId) {
  if (!lessonId) {
    return res.status(400).json({ error: "請提供教案 ID" });
  }

  const lesson = await findLessonById(lessonId);
  if (!lesson) {
    return res.status(404).json({ error: "找不到指定的教案" });
  }

  const prompt = `請為以下教案生成一個簡明的摘要（約200-300字）。

教案內容:
${lesson.content}

摘要應包含：
1. 教學主題與目標
2. 主要教學活動
3. 預期學習成果
4. 特色與亮點

請以 HTML 格式輸出，使用 <div>, <h3>, <p>, <ul>, <li> 等標籤。`;

  try {
    const content = await ragService.generateComment(prompt);

    res.json({
      type: "summary",
      title: "教案摘要",
      content: content.content,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 生成評分量表
 */
async function generateRubric(req, res, lessonId) {
  if (!lessonId) {
    return res.status(400).json({ error: "請提供教案 ID" });
  }

  const lesson = await findLessonById(lessonId);
  if (!lesson) {
    return res.status(404).json({ error: "找不到指定的教案" });
  }

  const criteria = ragService.getAllCriteria();

  const prompt = `請根據以下評分標準，為這份教案生成詳細的評分量表。

評分標準:
${JSON.stringify(criteria, null, 2)}

教案內容:
${lesson.content}

請以 HTML 表格格式輸出評分量表，包含：
1. 評分項目名稱
2. 評分標準說明
3. 建議評分（1-5分）
4. 評分理由

使用 <table>, <thead>, <tbody>, <tr>, <th>, <td> 等標籤，並加上適當的 class 以便樣式化。`;

  try {
    const content = await ragService.generateComment(prompt);

    res.json({
      type: "rubric",
      title: "評分量表",
      content: content.content,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 生成概念圖
 */
async function generateMindmap(req, res, lessonId) {
  if (!lessonId) {
    return res.status(400).json({ error: "請提供教案 ID" });
  }

  const lesson = await findLessonById(lessonId);
  if (!lesson) {
    return res.status(404).json({ error: "找不到指定的教案" });
  }

  const prompt = `請分析以下教案，並生成一個概念圖的文字描述。

教案內容:
${lesson.content}

請以 HTML 格式輸出，使用樹狀或階層式結構，包含：
1. 教學主題（中心節點）
2. 主要概念分支
3. 子概念與活動
4. 學習目標與成果

使用 <div> 配合 class（如 mindmap-node, mindmap-branch）來表示階層關係。
可以使用縮排和連接線符號（├─, └─）來表示結構。`;

  try {
    const content = await ragService.generateComment(prompt);

    res.json({
      type: "mindmap",
      title: "概念圖",
      content: content.content,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 生成評論報告
 */
async function generateReport(req, res, lessonId, scores) {
  if (!lessonId) {
    return res.status(400).json({ error: "請提供教案 ID" });
  }

  const lesson = await findLessonById(lessonId);
  if (!lesson) {
    return res.status(404).json({ error: "找不到指定的教案" });
  }

  try {
    // 使用 RAG 服務生成完整報告
    const report = await ragService.generateAnalysisReport(
      lesson.content,
      scores,
    );

    // 格式化報告為 HTML
    const htmlReport = formatReportAsHTML(report, lesson, scores);

    res.json({
      type: "report",
      title: "評論報告",
      content: htmlReport,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 格式化報告為 HTML
 */
function formatReportAsHTML(reportText, lesson, scores) {
  let html = `<div class="report-container">`;

  // 報告標題
  html += `<h2>教案評論報告</h2>`;
  html += `<div class="report-meta">`;
  html += `<p><strong>教案名稱:</strong> ${lesson.name}</p>`;
  html += `<p><strong>生成時間:</strong> ${new Date().toLocaleString("zh-TW")}</p>`;
  html += `</div>`;

  // 評分摘要（如果有）
  if (scores) {
    html += `<div class="score-summary">`;
    html += `<h3>評分摘要</h3>`;
    html += `<p><strong>總分:</strong> ${scores.total} / 5.0</p>`;
    html += `</div>`;
  }

  // 報告內容
  html += `<div class="report-content">`;
  html += reportText.replace(/\n/g, "<br>");
  html += `</div>`;

  html += `</div>`;

  return html;
}

/**
 * POST /api/generate/summary
 * 生成教案摘要（獨立端點）
 */
router.post("/summary", async (req, res) => {
  await generateSummary(req, res, req.body.lessonId);
});

/**
 * POST /api/generate/rubric
 * 生成評分量表（獨立端點）
 */
router.post("/rubric", async (req, res) => {
  await generateRubric(req, res, req.body.lessonId);
});

/**
 * POST /api/generate/mindmap
 * 生成概念圖（獨立端點）
 */
router.post("/mindmap", async (req, res) => {
  await generateMindmap(req, res, req.body.lessonId);
});

/**
 * POST /api/generate/report
 * 生成評論報告（獨立端點）
 */
router.post("/report", async (req, res) => {
  await generateReport(req, res, req.body.lessonId, req.body.scores);
});

async function findLessonById(rawLessonId) {
  const lessonId = parseFloat(rawLessonId);

  if (Number.isNaN(lessonId)) {
    return null;
  }

  return Lesson.findOne({ lessonId }, { _id: 0, __v: 0 }).lean();
}

module.exports = router;
