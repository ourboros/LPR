const path = require("path");
const crypto = require("crypto");

function normalizeLessonName(name = "") {
  const ext = path.extname(name || "");
  const withoutExt = ext ? name.slice(0, -ext.length) : String(name || "");

  return withoutExt
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\-_().]/g, "");
}

function buildContentHash(content = "") {
  return crypto
    .createHash("sha256")
    .update(String(content || ""))
    .digest("hex");
}

function buildSourceSignature({ normalizedName, type, size }) {
  return `${normalizedName || ""}|${type || ""}|${size || 0}`;
}

function computeSizeRatioDiff(sourceSize, targetSize) {
  const a = Number(sourceSize || 0);
  const b = Number(targetSize || 0);

  if (!a || !b) {
    return 1;
  }

  return Math.abs(a - b) / Math.max(a, b);
}

async function findDuplicateLessons(LessonModel, lessonMeta = {}) {
  const { normalizedName, contentHash, size, type } = lessonMeta;

  if (!LessonModel) {
    throw new Error("LessonModel is required");
  }

  if (!normalizedName && !contentHash) {
    return {
      isDuplicate: false,
      matchType: "none",
      matchedLessons: [],
    };
  }

  if (contentHash) {
    const exactMatches = await LessonModel.find(
      { contentHash },
      { _id: 0, __v: 0, content: 0 },
    )
      .sort({ uploadDate: -1 })
      .lean();

    if (exactMatches.length > 0) {
      return {
        isDuplicate: true,
        matchType: "content-hash",
        matchedLessons: exactMatches,
      };
    }
  }

  const nameCandidates = await LessonModel.find(
    {
      normalizedName,
      type,
    },
    { _id: 0, __v: 0, content: 0 },
  )
    .sort({ uploadDate: -1 })
    .lean();

  const nearMatches = nameCandidates.filter(
    (item) => computeSizeRatioDiff(item.size, size) <= 0.03,
  );

  if (nearMatches.length > 0) {
    return {
      isDuplicate: true,
      matchType: "name-size",
      matchedLessons: nearMatches,
    };
  }

  return {
    isDuplicate: false,
    matchType: "none",
    matchedLessons: [],
  };
}

module.exports = {
  normalizeLessonName,
  buildContentHash,
  buildSourceSignature,
  findDuplicateLessons,
};
