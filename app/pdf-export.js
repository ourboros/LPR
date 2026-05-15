/**
 * PDF 匯出工具模組
 * 支援匯出教案評論、對話記錄和評分結果為 PDF 檔案
 */

const PDFExporter = {
  /**
   * 初始化 PDF 匯出功能
   * 載入必要的 CDN 庫
   */
  async init() {
    // 檢查是否已載入必要的庫
    if (typeof html2pdf !== "undefined") {
      return true;
    }

    // 載入 html2pdf 庫
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.onload = () => {
        resolve(true);
      };
      script.onerror = () => {
        console.error("Failed to load html2pdf library");
        resolve(false);
      };
      document.head.appendChild(script);
    });
  },

  /**
   * 匯出評分結果為 PDF
   * @param {Object} scoreData - 評分資料
   * @param {string} lessonName - 教案名稱
   */
  async exportScoreReport(scoreData, lessonName = "教案評分報告") {
    if (!(await this.init())) {
      alert("PDF 匯出庫載入失敗，請稍後重試");
      return;
    }

    const scoreComment = document.getElementById("scoreComment")?.value || "";
    const totalScore =
      document.getElementById("totalScoreValue")?.textContent || "0.0/5.0";

    // 收集評分項目
    const ratingItems = [];
    document.querySelectorAll(".rating-item").forEach((item) => {
      const label = item.querySelector(".rating-label")?.textContent || "";
      const starValue =
        item.querySelector(".star-rating")?.dataset.value || "0";
      ratingItems.push({ label, value: starValue });
    });

    // 建立 HTML 內容
    const htmlContent = `
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Microsoft YaHei', sans-serif;
              line-height: 1.6;
              color: #333;
              padding: 20px;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #1976d2;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .header h1 {
              font-size: 24px;
              color: #1976d2;
              margin-bottom: 5px;
            }
            .header p {
              color: #666;
              font-size: 14px;
            }
            .section {
              margin-bottom: 25px;
              page-break-inside: avoid;
            }
            .section-title {
              font-size: 16px;
              font-weight: bold;
              color: #1976d2;
              border-left: 4px solid #1976d2;
              padding-left: 10px;
              margin-bottom: 12px;
            }
            .rating-list {
              background-color: #f5f5f5;
              padding: 15px;
              border-radius: 5px;
            }
            .rating-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #ddd;
            }
            .rating-row:last-child {
              border-bottom: none;
            }
            .rating-label {
              flex: 1;
              font-weight: 500;
            }
            .rating-value {
              width: 80px;
              text-align: right;
              color: #ff9800;
              font-weight: bold;
            }
            .total-score {
              background-color: #e3f2fd;
              padding: 15px;
              border-radius: 5px;
              text-align: center;
              margin: 15px 0;
              border: 2px solid #1976d2;
            }
            .total-score-label {
              font-size: 14px;
              color: #666;
            }
            .total-score-value {
              font-size: 32px;
              font-weight: bold;
              color: #1976d2;
            }
            .comment-section {
              background-color: #f9f9f9;
              padding: 15px;
              border-left: 4px solid #4caf50;
              border-radius: 3px;
            }
            .comment-label {
              font-weight: bold;
              margin-bottom: 8px;
              color: #4caf50;
            }
            .comment-text {
              white-space: pre-wrap;
              word-wrap: break-word;
              line-height: 1.5;
            }
            .empty-comment {
              color: #999;
              font-style: italic;
            }
            .footer {
              margin-top: 30px;
              padding-top: 15px;
              border-top: 1px solid #ddd;
              font-size: 12px;
              color: #999;
              text-align: center;
            }
            @media print {
              body { padding: 0; }
              .section { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📋 教案評分報告</h1>
            <p>${lessonName}</p>
            <p>生成時間: ${new Date().toLocaleString("zh-TW")}</p>
          </div>

          <div class="section">
            <div class="section-title">📊 評分明細</div>
            <div class="rating-list">
              ${ratingItems
                .map(
                  (item) => `
                <div class="rating-row">
                  <span class="rating-label">${item.label}</span>
                  <span class="rating-value">${item.value}/5</span>
                </div>
              `,
                )
                .join("")}
            </div>
            <div class="total-score">
              <div class="total-score-label">總體評分</div>
              <div class="total-score-value">${totalScore}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">💬 評分說明與建議</div>
            <div class="comment-section">
              <div class="comment-text">
                ${
                  scoreComment
                    ? scoreComment.replace(/</g, "&lt;").replace(/>/g, "&gt;")
                    : '<span class="empty-comment">（無評分說明）</span>'
                }
              </div>
            </div>
          </div>

          <div class="footer">
            <p>此報告由 AI教案評論系統自動生成</p>
          </div>
        </body>
      </html>
    `;

    const element = document.createElement("div");
    element.innerHTML = htmlContent;

    const options = {
      margin: 10,
      filename: `教案評分報告_${lessonName}_${new Date().getTime()}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    try {
      await html2pdf().set(options).from(element).save();
    } catch (error) {
      console.error("PDF 匯出失敗:", error);
      alert("PDF 匯出失敗，請稍後重試");
    }
  },

  /**
   * 匯出聊天記錄為 PDF
   * @param {Array} chatHistory - 聊天歷史陣列
   * @param {string} title - 標題
   */
  async exportChatHistory(chatHistory = [], title = "對話記錄") {
    if (!(await this.init())) {
      alert("PDF 匯出庫載入失敗，請稍後重試");
      return;
    }

    // 如果沒有提供歷史記錄，嘗試從 DOM 中提取
    if (!chatHistory || chatHistory.length === 0) {
      chatHistory = this.extractChatFromDOM();
    }

    if (chatHistory.length === 0) {
      alert("沒有對話記錄可匯出");
      return;
    }

    // 建立 HTML 內容
    const htmlContent = `
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Microsoft YaHei', sans-serif;
              line-height: 1.6;
              color: #333;
              padding: 20px;
              background-color: #f5f5f5;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #1976d2;
              padding-bottom: 15px;
              margin-bottom: 20px;
              background-color: white;
              padding: 20px;
              border-radius: 5px;
            }
            .header h1 {
              font-size: 24px;
              color: #1976d2;
              margin-bottom: 5px;
            }
            .header p {
              color: #666;
              font-size: 14px;
            }
            .messages {
              background-color: white;
              padding: 20px;
              border-radius: 5px;
            }
            .bubble {
              margin-bottom: 15px;
              padding: 12px 15px;
              border-radius: 8px;
              page-break-inside: avoid;
            }
            .bubble-user {
              background-color: #e3f2fd;
              border-left: 4px solid #1976d2;
              margin-left: 20px;
            }
            .bubble-ai {
              background-color: #f5f5f5;
              border-left: 4px solid #4caf50;
              margin-right: 20px;
            }
            .bubble-role {
              font-weight: bold;
              font-size: 12px;
              margin-bottom: 5px;
              opacity: 0.7;
            }
            .bubble-user .bubble-role {
              color: #1976d2;
            }
            .bubble-ai .bubble-role {
              color: #4caf50;
            }
            .bubble-text {
              white-space: pre-wrap;
              word-wrap: break-word;
              font-size: 14px;
            }
            .footer {
              margin-top: 30px;
              padding: 15px;
              background-color: white;
              border-top: 1px solid #ddd;
              font-size: 12px;
              color: #999;
              text-align: center;
              border-radius: 5px;
            }
            @media print {
              body { padding: 0; background-color: white; }
              .header, .messages, .footer { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>💬 ${title}</h1>
            <p>生成時間: ${new Date().toLocaleString("zh-TW")}</p>
            <p>共 ${chatHistory.length} 條訊息</p>
          </div>

          <div class="messages">
            ${chatHistory
              .map(
                (msg, idx) => `
              <div class="bubble bubble-${msg.role === "user" ? "user" : "ai"}">
                <div class="bubble-role">${msg.role === "user" ? "👤 使用者" : "🤖 AI"}</div>
                <div class="bubble-text">${msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
              </div>
            `,
              )
              .join("")}
          </div>

          <div class="footer">
            <p>此報告由 AI教案評論系統自動生成</p>
          </div>
        </body>
      </html>
    `;

    const element = document.createElement("div");
    element.innerHTML = htmlContent;

    const options = {
      margin: 10,
      filename: `${title}_${new Date().getTime()}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    try {
      await html2pdf().set(options).from(element).save();
    } catch (error) {
      console.error("PDF 匯出失敗:", error);
      alert("PDF 匯出失敗，請稍後重試");
    }
  },

  /**
   * 從 DOM 提取聊天記錄
   */
  extractChatFromDOM() {
    const messages = [];
    const chatList = document.getElementById("chatList");

    if (!chatList) {
      return messages;
    }

    chatList.querySelectorAll(".bubble").forEach((bubble) => {
      const isUser = bubble.classList.contains("bubble-user");
      const text = bubble.textContent.trim();

      if (text) {
        messages.push({
          role: isUser ? "user" : "assistant",
          text: text,
        });
      }
    });

    return messages;
  },

  /**
   * 匯出評論內容為 PDF
   * @param {string} reviewTitle - 評論標題
   * @param {string} reviewContent - 評論內容 (HTML)
   */
  async exportReviewContent(reviewTitle = "教案評論", reviewContent = "") {
    if (!(await this.init())) {
      alert("PDF 匯出庫載入失敗，請稍後重試");
      return;
    }

    // 如果沒有提供內容，嘗試從 DOM 中提取
    if (!reviewContent) {
      const reviewResult = document.getElementById("reviewResult");
      reviewContent = reviewResult ? reviewResult.innerHTML : "";
    }

    if (!reviewContent) {
      alert("沒有評論內容可匯出");
      return;
    }

    // 建立 HTML 內容
    const htmlContent = `
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Microsoft YaHei', sans-serif;
              line-height: 1.8;
              color: #333;
              padding: 20px;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #1976d2;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .header h1 {
              font-size: 24px;
              color: #1976d2;
              margin-bottom: 5px;
            }
            .header p {
              color: #666;
              font-size: 14px;
            }
            .content {
              background-color: #f9f9f9;
              padding: 20px;
              border-radius: 5px;
              border-left: 4px solid #1976d2;
            }
            /* Markdown 樣式 */
            .content h1, .content h2, .content h3 {
              color: #1976d2;
              margin-top: 15px;
              margin-bottom: 10px;
            }
            .content h1 { font-size: 20px; }
            .content h2 { font-size: 18px; }
            .content h3 { font-size: 16px; }
            .content p {
              margin-bottom: 10px;
            }
            .content ul, .content ol {
              margin-left: 20px;
              margin-bottom: 10px;
            }
            .content li {
              margin-bottom: 5px;
            }
            .content code {
              background-color: #f0f0f0;
              padding: 2px 6px;
              border-radius: 3px;
              font-family: monospace;
            }
            .content pre {
              background-color: #f0f0f0;
              padding: 12px;
              border-radius: 3px;
              overflow-x: auto;
              margin: 10px 0;
            }
            .content blockquote {
              border-left: 4px solid #ff9800;
              padding-left: 12px;
              margin-left: 0;
              margin: 10px 0;
              color: #666;
            }
            .footer {
              margin-top: 30px;
              padding-top: 15px;
              border-top: 1px solid #ddd;
              font-size: 12px;
              color: #999;
              text-align: center;
            }
            @media print {
              body { padding: 0; }
              .content { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📝 ${reviewTitle}</h1>
            <p>生成時間: ${new Date().toLocaleString("zh-TW")}</p>
          </div>

          <div class="content">
            ${reviewContent}
          </div>

          <div class="footer">
            <p>此報告由 AI教案評論系統自動生成</p>
          </div>
        </body>
      </html>
    `;

    const element = document.createElement("div");
    element.innerHTML = htmlContent;

    const options = {
      margin: 10,
      filename: `${reviewTitle}_${new Date().getTime()}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    try {
      await html2pdf().set(options).from(element).save();
    } catch (error) {
      console.error("PDF 匯出失敗:", error);
      alert("PDF 匯出失敗，請稍後重試");
    }
  },
};

// 匯出全域物件
window.PDFExporter = PDFExporter;
