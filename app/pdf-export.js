const PDFExporter = {
  async init() {
    if (typeof html2pdf !== "undefined") {
      return true;
    }
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.onload = () => resolve(true);
      script.onerror = () => {
        console.error("Failed to load html2pdf library");
        resolve(false);
      };
      document.head.appendChild(script);
    });
  },

  async exportAll(lessonName = "教案") {
    if (!(await this.init())) {
      alert("PDF 匯出庫載入失敗，請稍後重試");
      return;
    }

    try {
      const lessonId = window.LPR?.getCurrentLessonId();
      console.log("=== PDF 匯出開始 ===");
      console.log("教案 ID:", lessonId);
      console.log("教案名稱:", lessonName);

      const reviewContent = await this.collectReviewData();
      const chatHistory = await this.collectChatData();
      const scoreData = await this.collectScoreData();

      console.log("=== 收集完成 ===");
      console.log("評論可用:", reviewContent.available);
      console.log("對話可用:", chatHistory.available, "消息數:", chatHistory.messages?.length || 0);
      console.log("評分可用:", scoreData.available);

      const htmlContent = this.generateCombinedHTML(lessonName, reviewContent, chatHistory, scoreData);
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
      console.log("PDF 匯出完成");
    } catch (error) {
      console.error("PDF 匯出失敗:", error);
      alert("PDF 匯出失敗，請稍後重試");
    }
  },

  async collectReviewData() {
    try {
      const lessonId = window.LPR?.getCurrentLessonId();
      if (!lessonId) {
        return {
          title: "教案評論",
          content: "（尚未選擇教案）",
          available: false,
        };
      }

      const response = await window.LPR?.request(`/reviews/lesson/${lessonId}`, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
      });

      console.log("[PDF Export] 評論資料 API 返回:", response);

      if (!response || !Array.isArray(response)) {
        return {
          title: "教案評論",
          content: "（無評論內容）",
          available: false,
        };
      }

      const formalReviews = response
        .filter((r) => r.mode === "review-formal" && r.aiContent)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (formalReviews.length === 0) {
        return {
          title: "教案評論",
          content: "（無評論內容）",
          available: false,
        };
      }

      const reviewText = formalReviews.map((r) => r.aiContent).join("\n\n---\n\n");

      return {
        title: "教案評論",
        content: reviewText,
        available: true,
      };
    } catch (error) {
      console.error("收集評論資料失敗:", error);
      return {
        title: "教案評論",
        content: "（無法取得評論內容）",
        available: false,
      };
    }
  },

  async collectChatData() {
    try {
      const lessonId = window.LPR?.getCurrentLessonId();
      if (!lessonId) {
        return {
          title: "對話記錄",
          messages: [],
          available: false,
        };
      }

      const response = await window.LPR?.request(`/reviews/lesson/${lessonId}`, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
      });

      if (!response || !Array.isArray(response)) {
        return {
          title: "對話記錄",
          messages: [],
          available: false,
        };
      }

      const chatRecords = response
        .filter((r) => r.mode === "chat-free" && r.aiContent)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      console.log("[PDF Export] 過濾後的對話記錄數:", chatRecords.length);

      if (chatRecords.length === 0) {
        return {
          title: "對話記錄",
          messages: [],
          available: false,
        };
      }

      const messages = [];
      chatRecords.forEach((record) => {
        if (record.userPrompt && record.userPrompt.trim()) {
          messages.push({
            role: "使用者",
            text: record.userPrompt,
          });
        }
        if (record.aiContent && record.aiContent.trim()) {
          messages.push({
            role: "系統",
            text: record.aiContent,
          });
        }
      });

      console.log("[PDF Export] 最終生成的對話消息數:", messages.length);

      return {
        title: "對話記錄",
        messages: messages,
        available: messages.length > 0,
      };
    } catch (error) {
      console.error("[PDF Export] 收集對話記錄失敗:", error);
      return {
        title: "對話記錄",
        messages: [],
        available: false,
      };
    }
  },

  async collectScoreData() {
    try {
      const lessonId = window.LPR?.getCurrentLessonId();
      if (!lessonId) {
        return {
          title: "教案評分",
          ratings: [],
          comment: "",
          totalScore: "0.0/5.0",
          available: false,
        };
      }

      const response = await window.LPR?.request(`/scores/lesson/${lessonId}`, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
      });

      if (!response || !Array.isArray(response) || response.length === 0) {
        return {
          title: "教案評分",
          ratings: [],
          comment: "",
          totalScore: "0.0/5.0",
          available: false,
        };
      }

      const latestScore = response[0];
      const scores = latestScore.scores || {};

      const dimensionLabels = {
        structure: "教案架構與設計理念",
        objectives: "目標設定與課綱符合度",
        activities: "教學活動與邏輯安排",
        methods: "教學方法、資源與創意",
        assessment: "評量策略與時間分配",
      };

      const ratings = Object.entries(dimensionLabels).map(([key, label]) => ({
        label,
        value: scores[key] ? scores[key].toString() : "0",
      }));

      return {
        title: "教案評分",
        ratings: ratings,
        comment: latestScore.comment || "",
        totalScore: `${latestScore.total}/5.0`,
        available: true,
      };
    } catch (error) {
      console.error("收集評分資料失敗:", error);
      return {
        title: "教案評分",
        ratings: [],
        comment: "",
        totalScore: "0.0/5.0",
        available: false,
      };
    }
  },

  escapeHtml(text) {
    if (!text) return "";
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  },

  convertMarkdownToHtml(text) {
    if (!text) return "";
    let html = this.escapeHtml(text);
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(?<!\*)\*(.*?)\*(?!\*)/g, "<em>$1</em>");
    html = html.replace(/^### (.*?)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.*?)$/gm, "<h3>$1</h3>");
    html = html.replace(/^# (.*?)$/gm, "<h2>$1</h2>");
    html = html.replace(/`(.*?)`/g, "<code>$1</code>");
    html = html.replace(/\n/g, "<br>");
    return html;
  },

  generateCombinedHTML(lessonName, reviewData, chatData, scoreData) {
    return `
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
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
              page-break-inside: auto;
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
              page-break-inside: auto;
              overflow-wrap: break-word;
              word-break: break-word;
            }
            .rating-item {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 10px 0;
              border-bottom: 1px solid #eee;
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
              overflow-wrap: break-word;
            }
            .comment-text {
              white-space: pre-wrap;
              word-wrap: break-word;
              line-height: 1.5;
              color: #333;
              overflow-wrap: break-word;
            }
            .comment-text strong {
              font-weight: bold;
            }
            .comment-text em {
              font-style: italic;
            }
            .comment-text code {
              background-color: #f0f0f0;
              padding: 2px 4px;
              border-radius: 3px;
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
          </style>
        </head>
        <body>
          <div class="cover-page">
            <h1>教案完整報告</h1>
            <div class="subtitle">${lessonName}</div>
            <div class="meta">
              <p>生成日期: ${new Date().toLocaleString("zh-TW")}</p>
              <p>包含: 教案評論 | 對話記錄 | 評分結果</p>
            </div>
          </div>

          <div class="toc">
            <h2>目錄</h2>
            <ul>
              <li>1. 教案評論</li>
              <li>2. 對話記錄</li>
              <li>3. 教案評分</li>
              <li>4. 報告結束</li>
            </ul>
          </div>

          <div class="section section-break">
            <h2 class="section-title">1. 教案評論</h2>
            ${
              reviewData.available
                ? `<div class="content-box"><div class="comment-text">${this.convertMarkdownToHtml(reviewData.content)}</div></div>`
                : '<div class="empty-content">暫無評論內容</div>'
            }
          </div>

          <div class="section section-break">
            <h2 class="section-title">2. 對話記錄</h2>
            ${
              chatData.available
                ? chatData.messages
                    .map(
                      (msg) =>
                        `<div class="chat-message ${msg.role === "使用者" ? "user" : ""}">
                      <div class="message-role">${msg.role}</div>
                      <div class="message-text">${this.escapeHtml(msg.text)}</div>
                    </div>`
                    )
                    .join("")
                : '<div class="empty-content">暫無對話記錄</div>'
            }
          </div>

          <div class="section section-break">
            <h2 class="section-title">3. 教案評分</h2>
            ${
              scoreData.available
                ? `<div class="subsection-title">評分明細</div>
              <div class="content-box">
                ${scoreData.ratings
                  .map(
                    (item) =>
                      `<div class="rating-item"><span>${item.label}</span><span class="rating-value">${item.value}/5</span></div>`
                  )
                  .join("")}
              </div>
              <div class="total-score-box">
                <div class="total-score-label">總體評分</div>
                <div class="total-score-value">${scoreData.totalScore}</div>
              </div>
              ${
                scoreData.comment
                  ? `<div class="subsection-title">評分說明與建議</div><div class="content-box"><div class="comment-text">${this.convertMarkdownToHtml(scoreData.comment)}</div></div>`
                  : ""
              }`
                : '<div class="empty-content">暫無評分資料</div>'
            }
          </div>

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

window.PDFExporter = PDFExporter;
