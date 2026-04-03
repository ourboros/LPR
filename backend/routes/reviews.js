const express = require("express");
const router = express.Router();
const ReviewRecord = require("../models/ReviewRecord");
const Lesson = require("../models/Lesson");

function normalizeLessonId(rawLessonId) {
  const lessonId = Number.parseFloat(rawLessonId);
  if (!Number.isFinite(lessonId)) {
    return null;
  }

  return lessonId;
}

async function resolveHistoryLessonIds(lessonId) {
  const lesson = await Lesson.findOne({ lessonId }, { _id: 0, __v: 0 }).lean();
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

router.get("/lesson/:lessonId", async (req, res) => {
  try {
    const lessonId = normalizeLessonId(req.params.lessonId);
    if (!lessonId) {
      return res.status(400).json({ error: "無效的 lessonId" });
    }

    const reviews = await ReviewRecord.find(
      { lessonId, deletedAt: null },
      { _id: 0, __v: 0 },
    )
      .sort({ createdAt: -1 })
      .lean();

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: "取得評論紀錄失敗", message: error.message });
  }
});

router.get("/history/:lessonId", async (req, res) => {
  try {
    const lessonId = normalizeLessonId(req.params.lessonId);
    if (!lessonId) {
      return res.status(400).json({ error: "無效的 lessonId" });
    }

    const lessonIds = await resolveHistoryLessonIds(lessonId);
    if (lessonIds.length === 0) {
      return res.json({ lessonIds: [], reviews: [] });
    }

    const reviews = await ReviewRecord.find(
      {
        lessonId: { $in: lessonIds },
        deletedAt: null,
      },
      { _id: 0, __v: 0 },
    )
      .sort({ createdAt: -1 })
      .lean();

    res.json({ lessonIds, reviews });
  } catch (error) {
    res.status(500).json({ error: "取得歷史評論失敗", message: error.message });
  }
});

router.delete("/lesson/:lessonId", async (req, res) => {
  try {
    const lessonId = normalizeLessonId(req.params.lessonId);
    if (!lessonId) {
      return res.status(400).json({ error: "無效的 lessonId" });
    }

    const scope = req.query.scope === "history" ? "history" : "current";
    const lessonIds =
      scope === "history"
        ? await resolveHistoryLessonIds(lessonId)
        : [lessonId];

    const result = await ReviewRecord.updateMany(
      {
        lessonId: { $in: lessonIds },
        deletedAt: null,
      },
      { $set: { deletedAt: new Date() } },
    );

    res.json({
      success: true,
      message: "評論紀錄已刪除",
      affectedCount: result.modifiedCount,
      lessonIds,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "批次刪除評論紀錄失敗", message: error.message });
  }
});

router.delete("/:reviewId", async (req, res) => {
  try {
    const reviewId = normalizeLessonId(req.params.reviewId);
    if (!reviewId) {
      return res.status(400).json({ error: "無效的 reviewId" });
    }

    const result = await ReviewRecord.updateOne(
      { reviewId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    );

    if (!result.matchedCount) {
      return res.status(404).json({ error: "找不到指定的評論紀錄" });
    }

    res.json({ success: true, message: "評論紀錄已刪除" });
  } catch (error) {
    res.status(500).json({ error: "刪除評論紀錄失敗", message: error.message });
  }
});

module.exports = router;
