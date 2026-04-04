const mongoose = require("mongoose");

const lessonSchema = new mongoose.Schema(
  {
    lessonId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedName: {
      type: String,
      default: "",
      index: true,
    },
    contentHash: {
      type: String,
      default: "",
      index: true,
    },
    sourceSignature: {
      type: String,
      default: "",
      index: true,
    },
    canonicalLessonId: {
      type: Number,
      index: true,
    },
    filename: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    uploadDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    selected: {
      type: Boolean,
      default: false,
    },
    userId: {
      type: String,
      default: null,
      index: true,
    },
    sessionId: {
      type: String,
      default: null,
      index: true,
    },
    sessionExpiry: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    versionKey: false,
  },
);

lessonSchema.index({ canonicalLessonId: 1, uploadDate: -1 });
lessonSchema.index({ normalizedName: 1, size: 1, type: 1 });
lessonSchema.index({ userId: 1, uploadDate: -1 });
lessonSchema.index({ sessionId: 1, uploadDate: -1 });

module.exports = mongoose.model("Lesson", lessonSchema);
