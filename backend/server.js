// ============================================
// 教案輔助評論系統 - 後端伺服器
// ============================================

require("dotenv").config();
const { connectDB } = require("./config/db");
const { createApp } = require("./app");

const app = createApp();
const PORT = process.env.PORT || 5000;

// ============================================
// 啟動伺服器
// ============================================

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log("=".repeat(50));
      console.log("📚 教案輔助評論系統後端服務");
      console.log("=".repeat(50));
      console.log(`🚀 伺服器運行於: http://localhost:${PORT}`);
      console.log(`📅 啟動時間: ${new Date().toLocaleString("zh-TW")}`);
      console.log(
        `🤖 AI 模型: ${process.env.LLM_MODEL || "gemini-2.0-flash-exp"}`,
      );
      console.log("=".repeat(50));
    });
  } catch (error) {
    console.error("伺服器啟動失敗:", error.message);
    process.exit(1);
  }
}

startServer();

// 優雅關閉
process.on("SIGTERM", () => {
  console.log("收到 SIGTERM 信號，正在關閉伺服器...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\n收到 SIGINT 信號，正在關閉伺服器...");
  process.exit(0);
});
