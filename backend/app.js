// ============================================
// 教案輔助評論系統 - Express App Factory
// 版本: 2026-04-04 08:30 UTC - Force redeploy
// ============================================

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

function createApp() {
  const app = express();
  const uiRoot = path.join(__dirname, "../lesson-review-ui");

  app.use(
    cors({
      origin: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
      ],
      credentials: true,
    }),
  );

  app.use(bodyParser.json({ limit: "50mb" }));
  app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

  app.use("/app", express.static(uiRoot));

  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  const authRoutes = require("./routes/auth");
  const chatRoutes = require("./routes/chat");
  const uploadRoutes = require("./routes/upload");
  const scoreRoutes = require("./routes/scores");
  const generateRoutes = require("./routes/generate");
  const reviewRoutes = require("./routes/reviews");

  app.use("/api/auth", authRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/upload", uploadRoutes);
  app.use("/api/scores", scoreRoutes);
  app.use("/api/generate", generateRoutes);
  app.use("/api/reviews", reviewRoutes);

  app.get("/", (req, res) => {
    res.redirect("/app/upload.html");
  });

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "教案輔助評論系統",
    });
  });

  app.use((req, res) => {
    res.status(404).json({
      error: "找不到請求的資源",
      path: req.path,
    });
  });

  app.use((err, req, res, next) => {
    console.error("伺服器錯誤:", err);
    res.status(500).json({
      error: "伺服器內部錯誤",
      message:
        process.env.NODE_ENV === "development" ? err.message : "請稍後再試",
    });
  });

  return app;
}

module.exports = { createApp };
