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
   * 生成對話回應
   * @param {string} prompt - 完整的提示詞
   * @param {Array} history - 對話歷史 (可選)
   * @returns {Promise<string>} AI 回應文本
   */
  async generateResponse(prompt, history = [], generationConfig = {}) {
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
      console.error("Gemini API 錯誤:", error);

      // 處理常見錯誤
      if (error.message?.includes("quota")) {
        throw new Error("API 配額已用盡，請稍後再試");
      }
      if (error.message?.includes("API key")) {
        throw new Error("API 金鑰無效");
      }

      throw new Error(`生成回應失敗: ${error.message}`);
    }
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
