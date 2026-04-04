const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    sessionExpiry: {
      type: Date,
      default: null,
    },
    preferences: {
      theme: {
        type: String,
        default: "light",
        enum: ["light", "dark"],
      },
      notifications: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("User", userSchema);
