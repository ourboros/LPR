const mongoose = require("mongoose");

const scoreSchema = new mongoose.Schema(
  {
    scoreId: {
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
    scores: {
      structure: { type: Number, min: 0, max: 5, default: 0 },
      objectives: { type: Number, min: 0, max: 5, default: 0 },
      activities: { type: Number, min: 0, max: 5, default: 0 },
      methods: { type: Number, min: 0, max: 5, default: 0 },
      assessment: { type: Number, min: 0, max: 5, default: 0 },
    },
    total: {
      type: Number,
      min: 0,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);

scoreSchema.index({ lessonId: 1, createdAt: -1 });

module.exports = mongoose.model("Score", scoreSchema);
