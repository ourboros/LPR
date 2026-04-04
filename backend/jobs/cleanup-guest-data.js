const cron = require("node-cron");
const Lesson = require("../models/Lesson");
const ReviewRecord = require("../models/ReviewRecord");
const Score = require("../models/Score");

function initCleanupGuestDataJob() {
  cron.schedule("0 */6 * * *", async () => {
    try {
      const now = new Date();
      const expiredLessons = await Lesson.find(
        {
          userId: null,
          sessionExpiry: { $ne: null, $lt: now },
        },
        { _id: 0, lessonId: 1, sessionId: 1 },
      ).lean();

      if (expiredLessons.length === 0) {
        console.log("[CleanupGuestData] no expired guest data");
        return;
      }

      const lessonIds = expiredLessons.map((item) => item.lessonId);
      const sessionIds = expiredLessons
        .map((item) => item.sessionId)
        .filter((item) => Boolean(item));

      const reviewFilter = {
        userId: null,
        $or: [
          { lessonId: { $in: lessonIds } },
          { sessionId: { $in: sessionIds } },
        ],
      };

      const scoreFilter = {
        userId: null,
        $or: [
          { lessonId: { $in: lessonIds } },
          { sessionId: { $in: sessionIds } },
        ],
      };

      const [lessonDeleteResult, reviewDeleteResult, scoreDeleteResult] =
        await Promise.all([
          Lesson.deleteMany({ lessonId: { $in: lessonIds }, userId: null }),
          ReviewRecord.deleteMany(reviewFilter),
          Score.deleteMany(scoreFilter),
        ]);

      console.log(
        `[CleanupGuestData] removed lessons=${lessonDeleteResult.deletedCount}, reviews=${reviewDeleteResult.deletedCount}, scores=${scoreDeleteResult.deletedCount}`,
      );
    } catch (error) {
      console.error("[CleanupGuestData] failed:", error.message);
    }
  });

  console.log("[CleanupGuestData] cron initialized (every 6 hours)");
}

module.exports = {
  initCleanupGuestDataJob,
};
