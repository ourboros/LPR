// ============================================
// Gemini API 客戶端服務
// ============================================

const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiClient {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY 未設定在環境變數中");
    }

    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.modelName = process.env.LLM_MODEL || "gemini-1.5-flash";
  }

  /**
   * 生成對話回應（包含重試機制）
   * @param {string} prompt - 完整的提示詞
   * @param {Array} history - 對話歷史 (可選)
   * @returns {Promise<string>} AI 回應文本
   */
  async generateResponse(prompt, history = [], generationConfig = {}) {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 秒

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 2048,
            ...generationConfig,
          },
        });

        // 如果有對話歷史，使用 chat 模式
        if (history && history.length > 0) {
          const chat = model.startChat({
            history: this.formatHistory(history),
          });

          const result = await chat.sendMessage(prompt);
          const response = await result.response;
          return response.text();
        }

        // 單次對話模式
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      } catch (error) {
        // ✅ 改進：檢查是否為 503 或臨時故障
        const isRetryable = this.isRetryableError(error);
        const isLastAttempt = attempt === maxRetries;

        console.error(
          `[Gemini API 錯誤] 第 ${attempt}/${maxRetries} 次嘗試失敗:`,
          error.message,
        );

        if (!isRetryable || isLastAttempt) {
          // ✅ 改進：提供更詳細的錯誤信息
          throw this.formatApiError(error, attempt);
        }

        // ✅ 新增：延遲後重試
        const waitTime = retryDelay * Math.pow(2, attempt - 1); // 指數退避
        console.info(
          `[重試機制] ${waitTime}ms 後進行第 ${attempt + 1} 次嘗試...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    throw new Error("無法連接到 Gemini API，請稍後再試");
  }

  /**
   * ✅ 新增：判斷錯誤是否可重試
   * @param {Error} error - 錯誤對象
   * @returns {boolean} 是否應該重試
   */
  isRetryableError(error) {
    const message = error.message || "";
    const errorStr = error.toString() || "";

    // 503 Service Unavailable、429 Too Many Requests 等臨時錯誤
    const retryablePatterns = [
      /503|Service Unavailable/i,
      /429|Too Many Requests/i,
      /timeout|timed out/i,
      /ECONNREFUSED|ECONNRESET/i,
      /temporarily unavailable/i,
      /temporarily overloaded/i,
    ];

    return retryablePatterns.some(
      (pattern) => pattern.test(message) || pattern.test(errorStr),
    );
  }

  /**
   * ✅ 新增：格式化 API 錯誤信息
   * @param {Error} error - 原始錯誤
   * @param {number} attempts - 嘗試次數
   * @returns {Error} 格式化的錯誤
   */
  formatApiError(error, attempts) {
    const message = error.message || "";

    // 處理常見錯誤
    if (message.includes("quota")) {
      return new Error("API 配額已用盡，請稍後再試");
    }
    if (message.includes("API key")) {
      return new Error("API 金鑰無效");
    }
    if (message.includes("503") || message.includes("Service Unavailable")) {
      return new Error(
        "Google AI 服務目前負載過高，請稍後再試。如果問題持續，請重新整理頁面。",
      );
    }
    if (message.includes("429") || message.includes("Too Many Requests")) {
      return new Error("請求過於頻繁，請等待幾秒鐘後再試");
    }

    // 通用錯誤
    return new Error(`生成回應失敗 (${attempts}/${3} 次嘗試): ${message}`);
  }

  /**
   * 生成結構化內容（JSON 格式）
   * @param {string} prompt - 提示詞
   * @returns {Promise<Object>} 解析後的 JSON 物件
   */
  async generateStructuredResponse(prompt) {
    try {
      const fullPrompt = `${prompt}\n\n請以 JSON 格式回應，不要包含任何其他文字。`;
      const response = await this.generateResponse(fullPrompt);

      // 嘗試提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return JSON.parse(response);
    } catch (error) {
      console.error("生成結構化內容失敗:", error);
      throw new Error("無法生成有效的結構化回應");
    }
  }

  /**
   * 格式化對話歷史為 Gemini API 格式
   * @param {Array} history - 對話歷史陣列
   * @returns {Array} 格式化後的歷史
   */
  formatHistory(history) {
    return history.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));
  }

  /**
   * 檢查 API 連線狀態
   * @returns {Promise<boolean>}
   */
  async checkConnection() {
    try {
      await this.generateResponse("測試連線");
      return true;
    } catch (error) {
      console.error("Gemini API 連線失敗:", error);
      return false;
    }
  }
}

// 導出單例
module.exports = new GeminiClient();
