const mongoose = require("mongoose");

const reviewRecordSchema = new mongoose.Schema(
  {
    reviewId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    lessonId: {
      type: Number,
      required: true,
      index: true,
    },
    contentHash: {
      type: String,
      default: "",
      index: true,
    },
    sessionId: {
      type: String,
      default: "",
      index: true,
    },
    mode: {
      type: String,
      default: "chat-free",
      index: true,
    },
    action: {
      type: String,
      default: "free",
      index: true,
    },
    userPrompt: {
      type: String,
      default: "",
    },
    aiContent: {
      type: String,
      required: true,
    },
    sources: {
      type: [String],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    userId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    versionKey: false,
  },
);

reviewRecordSchema.index({ lessonId: 1, createdAt: -1 });
reviewRecordSchema.index({ contentHash: 1, createdAt: -1 });
reviewRecordSchema.index({ userId: 1, createdAt: -1 });
reviewRecordSchema.index({ sessionId: 1, createdAt: -1 });

module.exports = mongoose.model("ReviewRecord", reviewRecordSchema);
