// ============================================
// 教案輔助評論系統 - 後端伺服器
// ============================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const uiRoot = path.join(__dirname, "../lesson-review-ui");

// ============================================
// 中介軟體配置
// ============================================

// CORS 設定
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  }),
);

// Body parser
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// 靜態檔案
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/app", express.static(uiRoot));

// 請求日誌
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// 路由掛載
// ============================================

const chatRoutes = require("./routes/chat");
const uploadRoutes = require("./routes/upload");
const scoreRoutes = require("./routes/scores");
const generateRoutes = require("./routes/generate");

app.use("/api/chat", chatRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/scores", scoreRoutes);
app.use("/api/generate", generateRoutes);

app.get("/", (req, res) => {
  res.redirect("/app/upload.html");
});

// 健康檢查
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "教案輔助評論系統",
  });
});

// ============================================
// 錯誤處理
// ============================================

// 404 處理
app.use((req, res) => {
  res.status(404).json({
    error: "找不到請求的資源",
    path: req.path,
  });
});

// 全域錯誤處理
app.use((err, req, res, next) => {
  console.error("伺服器錯誤:", err);
  res.status(500).json({
    error: "伺服器內部錯誤",
    message:
      process.env.NODE_ENV === "development" ? err.message : "請稍後再試",
  });
});

// ============================================
// 啟動伺服器
// ============================================

app.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log("📚 教案輔助評論系統後端服務");
  console.log("=".repeat(50));
  console.log(`🚀 伺服器運行於: http://localhost:${PORT}`);
  console.log(`📅 啟動時間: ${new Date().toLocaleString("zh-TW")}`);
  console.log(`🤖 AI 模型: ${process.env.LLM_MODEL || "gemini-2.0-flash-exp"}`);
  console.log("=".repeat(50));
});

// 優雅關閉
process.on("SIGTERM", () => {
  console.log("收到 SIGTERM 信號，正在關閉伺服器...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\n收到 SIGINT 信號，正在關閉伺服器...");
  process.exit(0);
});
