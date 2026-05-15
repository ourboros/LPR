/**
 * PDF 匯出工具模組 - 全域匯出系統
 * 支援一次性匯出教案評論、對話記錄和評分結果為 PDF 檔案
 * 不包含任何表情符號，僅顯示純文字
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
   * 全域匯出功能 - 一次匯出所有頁面內容
   * @param {string} lessonName - 教案名稱
   */
  async exportAll(lessonName = "教案") {
    if (!(await this.init())) {
      alert("PDF 匯出庫載入失敗，請稍後重試");
      return;
    }

    try {
      // 收集評論內容
      const reviewContent = await this.collectReviewData();

      // 收集對話記錄
      const chatHistory = await this.collectChatData();

      // 收集評分資料
      const scoreData = await this.collectScoreData();

      // 生成聯合 PDF
      const htmlContent = this.generateCombinedHTML(
        lessonName,
        reviewContent,
        chatHistory,
        scoreData,
      );

      const element = document.createElement("div");
      element.innerHTML = htmlContent;

      const options = {
        margin: 10,
        filename: `${lessonName}_完整報告_${new Date().getTime()}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };

      await html2pdf().set(options).from(element).save();
    } catch (error) {
      console.error("PDF 匯出失敗:", error);
      alert("PDF 匯出失敗，請稍後重試");
    }
  },

  /**
   * 收集評論資料
   */
  async collectReviewData() {
    const reviewResult = document.getElementById("reviewResult");
    if (!reviewResult) {
      return {
        title: "教案評論",
        content: "（無評論內容）",
        available: false,
      };
    }

    // 提取純文字內容（移除 Markdown 標記）
    const bubbles = reviewResult.querySelectorAll(".review-bubble");
    let reviewText = "";

    bubbles.forEach((bubble, index) => {
      reviewText += bubble.textContent.trim();
      if (index < bubbles.length - 1) {
        reviewText += "\n\n---\n\n";
      }
    });

    return {
      title: "教案評論",
      content: reviewText || "（無評論內容）",
      available: bubbles.length > 0,
    };
  },

  /**
   * 收集對話記錄
   */
  async collectChatData() {
    const chatList = document.getElementById("chatList");
    if (!chatList) {
      return {
        title: "對話記錄",
        messages: [],
        available: false,
      };
    }

    const messages = [];
    const bubbles = chatList.querySelectorAll(".bubble");

    bubbles.forEach((bubble) => {
      const isUser = bubble.classList.contains("bubble-user");
      const text = bubble.textContent.trim();

      if (text) {
        messages.push({
          role: isUser ? "使用者" : "系統",
          text: text,
        });
      }
    });

    return {
      title: "對話記錄",
      messages: messages,
      available: messages.length > 0,
    };
  },

  /**
   * 收集評分資料
   */
  async collectScoreData() {
    const totalScoreValue = document.getElementById("totalScoreValue");
    const scoreComment = document.getElementById("scoreComment");

    if (!totalScoreValue && !scoreComment) {
      return {
        title: "教案評分",
        ratings: [],
        comment: "",
        totalScore: "0.0/5.0",
        available: false,
      };
    }

    // 收集評分項目
    const ratings = [];
    document.querySelectorAll(".rating-item").forEach((item) => {
      const label = item.querySelector(".rating-label")?.textContent || "";
      const starValue =
        item.querySelector(".star-rating")?.dataset.value || "0";
      ratings.push({ label, value: starValue });
    });

    return {
      title: "教案評分",
      ratings: ratings,
      comment: scoreComment?.value || "",
      totalScore: totalScoreValue?.textContent || "0.0/5.0",
      available: true,
    };
  },

  /**
   * 生成聯合 HTML 報告
   */
  generateCombinedHTML(lessonName, reviewData, chatData, scoreData) {
    return `
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body {
              width: 100%;
              height: auto;
            }
            body {
              font-family: 'Microsoft YaHei', 'SimSun', sans-serif;
              line-height: 1.6;
              color: #333;
              padding: 20px;
              background: white;
            }
            .cover-page {
              text-align: center;
              padding: 60px 20px;
              border-bottom: 3px solid #1976d2;
              margin-bottom: 40px;
              page-break-after: always;
            }
            .cover-page h1 {
              font-size: 36px;
              color: #1976d2;
              margin-bottom: 20px;
              font-weight: bold;
            }
            .cover-page .subtitle {
              font-size: 18px;
              color: #666;
              margin-bottom: 30px;
            }
            .cover-page .meta {
              font-size: 14px;
              color: #999;
              margin-top: 40px;
            }
            .toc {
              page-break-after: always;
              margin-bottom: 40px;
            }
            .toc h2 {
              font-size: 20px;
              color: #1976d2;
              margin-bottom: 20px;
              font-weight: bold;
            }
            .toc ul {
              list-style: none;
              padding-left: 0;
            }
            .toc li {
              padding: 8px 0;
              font-size: 14px;
              border-bottom: 1px solid #eee;
            }
            .section {
              margin-bottom: 40px;
              page-break-inside: avoid;
            }
            .section-break {
              page-break-after: always;
              margin-bottom: 0;
            }
            .section-title {
              font-size: 22px;
              font-weight: bold;
              color: #1976d2;
              border-bottom: 3px solid #1976d2;
              padding-bottom: 12px;
              margin-bottom: 20px;
              margin-top: 30px;
            }
            .subsection-title {
              font-size: 16px;
              font-weight: bold;
              color: #2196f3;
              margin-top: 20px;
              margin-bottom: 12px;
              border-left: 4px solid #2196f3;
              padding-left: 10px;
            }
            .content-box {
              background-color: #f9f9f9;
              padding: 15px;
              border-left: 4px solid #1976d2;
              border-radius: 3px;
              margin: 12px 0;
            }
            .rating-item {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 10px 0;
              border-bottom: 1px solid #eee;
            }
            .rating-item:last-child {
              border-bottom: none;
            }
            .rating-label {
              flex: 1;
              font-weight: 500;
            }
            .rating-value {
              width: 100px;
              text-align: right;
              font-weight: bold;
              color: #ff9800;
            }
            .total-score-box {
              background-color: #e3f2fd;
              padding: 20px;
              border-radius: 5px;
              text-align: center;
              margin: 20px 0;
              border: 2px solid #1976d2;
            }
            .total-score-label {
              font-size: 14px;
              color: #666;
              margin-bottom: 8px;
            }
            .total-score-value {
              font-size: 32px;
              font-weight: bold;
              color: #1976d2;
            }
            .chat-message {
              margin: 12px 0;
              padding: 12px;
              border-radius: 5px;
              background-color: #f5f5f5;
            }
            .chat-message.user {
              background-color: #e3f2fd;
              margin-left: 20px;
              border-left: 3px solid #1976d2;
            }
            .chat-message.system {
              background-color: #f5f5f5;
              border-left: 3px solid #666;
            }
            .message-role {
              font-weight: bold;
              font-size: 12px;
              color: #666;
              margin-bottom: 4px;
            }
            .message-text {
              white-space: pre-wrap;
              word-wrap: break-word;
              font-size: 13px;
              line-height: 1.5;
            }
            .comment-text {
              white-space: pre-wrap;
              word-wrap: break-word;
              line-height: 1.5;
              color: #333;
            }
            .empty-content {
              color: #999;
              font-style: italic;
              padding: 20px;
              text-align: center;
            }
            .footer {
              margin-top: 40px;
              padding-top: 15px;
              border-top: 2px solid #ddd;
              font-size: 12px;
              color: #999;
              text-align: center;
            }
            @media print {
              .section-break { page-break-after: always; }
              .section { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <!-- 封面 -->
          <div class="cover-page">
            <h1>教案完整報告</h1>
            <div class="subtitle">${lessonName}</div>
            <div class="meta">
              <p>生成日期: ${new Date().toLocaleString("zh-TW")}</p>
              <p>包含: 教案評論 | 對話記錄 | 評分結果</p>
            </div>
          </div>

          <!-- 目錄 -->
          <div class="toc">
            <h2>目錄</h2>
            <ul>
              <li>1. 教案評論</li>
              <li>2. 對話記錄</li>
              <li>3. 教案評分</li>
              <li>4. 報告結束</li>
            </ul>
          </div>

          <!-- 第一部分: 評論 -->
          <div class="section section-break">
            <h2 class="section-title">1. 教案評論</h2>
            ${
              reviewData.available
                ? `<div class="content-box">
                   <div class="comment-text">${reviewData.content.replace(
                     /</g,
                     "&lt;",
                   )}</div>
                 </div>`
                : '<div class="empty-content">暫無評論內容</div>'
            }
          </div>

          <!-- 第二部分: 對話記錄 -->
          <div class="section section-break">
            <h2 class="section-title">2. 對話記錄</h2>
            ${
              chatData.available
                ? chatData.messages
                    .map(
                      (msg) => `
                    <div class="chat-message ${msg.role === "使用者" ? "user" : "system"}">
                      <div class="message-role">${msg.role}</div>
                      <div class="message-text">${msg.text.replace(
                        /</g,
                        "&lt;",
                      )}</div>
                    </div>
                  `,
                    )
                    .join("")
                : '<div class="empty-content">暫無對話記錄</div>'
            }
          </div>

          <!-- 第三部分: 評分結果 -->
          <div class="section section-break">
            <h2 class="section-title">3. 教案評分</h2>
            ${
              scoreData.available
                ? `
              <div class="subsection-title">評分明細</div>
              <div class="content-box">
                ${scoreData.ratings
                  .map(
                    (item) => `
                  <div class="rating-item">
                    <span class="rating-label">${item.label}</span>
                    <span class="rating-value">${item.value}/5</span>
                  </div>
                `,
                  )
                  .join("")}
              </div>

              <div class="total-score-box">
                <div class="total-score-label">總體評分</div>
                <div class="total-score-value">${scoreData.totalScore}</div>
              </div>

              ${
                scoreData.comment
                  ? `
                <div class="subsection-title">評分說明與建議</div>
                <div class="content-box">
                  <div class="comment-text">${scoreData.comment.replace(
                    /</g,
                    "&lt;",
                  )}</div>
                </div>
              `
                  : ""
              }
            `
                : '<div class="empty-content">暫無評分資料</div>'
            }
          </div>

          <!-- 報告結束 -->
          <div class="section">
            <h2 class="section-title">報告結束</h2>
            <div class="footer">
              <p>此報告由 AI教案評論系統自動生成</p>
              <p>共 ${1 + (chatData.available ? chatData.messages.length : 0)} 項內容</p>
            </div>
          </div>
        </body>
      </html>
    `;
  },
};

// 匯出全域物件
window.PDFExporter = PDFExporter;
