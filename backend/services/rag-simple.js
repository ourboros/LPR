// ============================================
// 簡化版 RAG 服務（不使用 Embedding）
// ============================================

const fs = require("fs");
const path = require("path");
const geminiClient = require("./geminiClient");
const promptService = require("./promptService");
const SearchEngineFactory = require("./search/SearchEngineFactory");

class RAGSimpleService {
  constructor() {
    this.criteria = null;
    this.essentials = null;
    this.guidelines = null;
    this.searchEngine = SearchEngineFactory.create(
      process.env.SEARCH_ENGINE || "simple",
    );
    this.loadData();
  }

  /**
   * 載入所有評分資料
   */
  loadData() {
    try {
      // 載入 11 個詳細評分標準
      const criteriaPath = path.join(__dirname, "../data/criteria.json");
      this.criteria = JSON.parse(fs.readFileSync(criteriaPath, "utf-8"));

      // 載入教案核心要素
      const essentialsPath = path.join(
        __dirname,
        "../data/lesson-plan-essentials.json",
      );
      this.essentials = JSON.parse(fs.readFileSync(essentialsPath, "utf-8"));

      // 載入教案評鑑指南（5大面向）
      const guidelinesPath = path.join(
        __dirname,
        "../data/evaluation-guidelines.json",
      );
      this.guidelines = JSON.parse(fs.readFileSync(guidelinesPath, "utf-8"));

      console.log(`✅ 已載入 ${this.criteria.length} 個評分標準`);
      console.log(
        `✅ 已載入 ${this.essentials.core_elements.length} 個核心要素`,
      );
      console.log(`✅ 已載入 ${this.guidelines.length} 個評鑑面向`);
    } catch (error) {
      console.error("載入評分資料失敗:", error);
      throw new Error("無法載入評分資料");
    }
  }

  /**
   * 建構完整的評分標準 context
   * @returns {string} 格式化的評分標準文本
   */
  buildCriteriaContext() {
    if (!this.criteria || !this.essentials || !this.guidelines) {
      this.loadData();
    }

    // 1. 教案核心要素檢核清單
    let context = "【教案核心要素】（必須具備以下 7 項）\n";
    context += `${this.essentials.definition}\n\n`;
    this.essentials.core_elements.forEach((element, index) => {
      context += `${index + 1}. ${element.name}：${element.description}\n`;
    });
    context += `\n${this.essentials.summary}\n\n`;

    // 2. 五大評鑑面向
    context += "【教案設計與評鑑指南】（5 大評鑑面向）\n\n";
    this.guidelines.forEach((guideline, index) => {
      context += `${index + 1}. ${guideline.title} (${guideline.subtitle})\n`;
      context += `   評論要點：${guideline.focus}\n`;
      context += `   所需資料：\n`;
      guideline.required_data.forEach((data) => {
        context += `   • ${data}\n`;
      });
      context += `   對應標準：${guideline.related_criteria.join(", ")}\n\n`;
    });

    // 3. 詳細評分標準（簡化版，僅供參考）
    context += "【詳細評分標準】（11 項，僅供參考細節）\n\n";
    this.criteria.forEach((criterion, index) => {
      context += `${index + 1}. ${criterion.title} (權重${(criterion.score_weight * 100).toFixed(0)}%)：${criterion.description}\n`;
    });

    return context;
  }

  /**
   * 根據用戶問題找出相關的評分標準
   * @param {string} query - 用戶問題
   * @returns {Array} 相關的評分標準
   */
  async findRelevantCriteria(query) {
    const results = await this.searchEngine.search(query, {
      criteria: this.criteria,
      limit: this.criteria.length,
    });

    if (!results || results.length === 0) {
      return this.criteria;
    }

    return results;
  }

  /**
   * 生成教案評論
   * @param {string} userMessage - 用戶訊息
   * @param {string} lessonContent - 教案內容（可選）
   * @param {Array} chatHistory - 對話歷史
   * @returns {Promise<Object>} AI 回應
   */
  async generateComment(
    userMessage,
    lessonContent = null,
    chatHistory = [],
    options = {},
  ) {
    try {
      const { mode = "chat-free", action = "free", maxChars } = options;
      const criteriaContext = this.buildCriteriaContext();
      const policy = promptService.getModePolicy(mode, action, maxChars);

      const fullPrompt = promptService.buildPrompt({
        mode: policy.mode,
        action: policy.action,
        userMessage,
        lessonContent,
        criteriaContext,
      });

      // ✅ 改進：添加詳細日誌用於診斷
      console.info(`[RAG] 開始生成評論`, {
        mode,
        action,
        maxChars,
        lessonContentLength: lessonContent ? lessonContent.length : 0,
        chatHistoryLength: chatHistory.length,
      });

      // 呼叫 Gemini API
      const rawResponse = await geminiClient.generateResponse(
        fullPrompt,
        chatHistory,
        {
          maxOutputTokens: policy.maxOutputTokens,
          temperature: mode === "quick-action" ? 0.45 : 0.7,
        },
      );

      const content = await this.enforceMaxChars(
        rawResponse,
        policy.maxChars,
        lessonContent,
        mode,
        action,
      );

      const related = await this.findRelevantCriteria(userMessage);

      console.info(`[RAG] 成功生成評論`, {
        mode,
        action,
        contentLength: content.length,
        relatedCriteria: related.length,
      });

      return {
        role: "assistant",
        content,
        sources: related.map((c) => c.id),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // ✅ 改進：提供詳細的錯誤診斷信息
      const errorMessage = error.message || "未知錯誤";
      const errorDetails = {
        message: errorMessage,
        mode: options.mode,
        action: options.action,
        timestamp: new Date().toISOString(),
      };

      console.error("生成評論失敗:", errorDetails, error);

      // ✅ 改進：區分不同的錯誤類型並提供合適的用戶消息
      if (
        errorMessage.includes("503") ||
        errorMessage.includes("Service Unavailable")
      ) {
        const customError = new Error(errorMessage);
        customError.statusCode = 503;
        customError.userMessage =
          "Google AI 服務目前負載過高，請稍後再試。系統已自動重試，如問題持續，請重新整理頁面重試。";
        throw customError;
      }

      if (
        errorMessage.includes("429") ||
        errorMessage.includes("Too Many Requests")
      ) {
        const customError = new Error(errorMessage);
        customError.statusCode = 429;
        customError.userMessage = "請求過於頻繁，請等待幾秒鐘後再試";
        throw customError;
      }

      // 其他錯誤
      const customError = new Error(errorMessage);
      customError.statusCode = 500;
      customError.userMessage =
        "生成評論失敗，請檢查教案內容是否完整，稍後再試。";
      throw customError;
    }
  }

  async enforceMaxChars(text, maxChars, lessonContent, mode, action) {
    if (!maxChars || !Number.isFinite(maxChars) || maxChars <= 0) {
      return String(text || "").trim();
    }

    const normalized = String(text || "").trim();
    if (normalized.length <= maxChars) {
      return normalized;
    }

    const compressPrompt = `請將以下內容濃縮為 ${maxChars} 字以內，保留核心重點，且段落必須完整收束。\n\n要求：\n1. 不可中途截斷句子。\n2. 不可輸出未完成的條列點。\n3. 若無法剛好達到上限，寧可略少，但要完整結尾。\n\n【模式】${mode}/${action}\n\n【原始內容】\n${normalized}\n\n【教案內容節錄】\n${String(lessonContent || "").slice(0, 800)}\n\n請直接輸出濃縮結果。`;

    const compressionMaxTokens = Math.max(
      800,
      Math.min(3072, Math.ceil(maxChars * 1.6)),
    );

    try {
      const compressed = await geminiClient.generateResponse(
        compressPrompt,
        [],
        {
          temperature: 0.2,
          maxOutputTokens: compressionMaxTokens,
        },
      );

      const compact = String(compressed || "").trim();
      if (compact.length <= maxChars) {
        return await this.ensureCompleteEnding(compact, maxChars, mode, action);
      }
    } catch (error) {
      console.warn("壓縮回應失敗，改用硬切字數:", error.message);
    }

    const fallback = this.truncateAtSentenceBoundary(normalized, maxChars);
    return this.ensureCompleteEnding(fallback, maxChars, mode, action);
  }

  isLikelyCompleteEnding(text) {
    const normalized = String(text || "").trim();
    if (!normalized) {
      return false;
    }

    if (/[。！？.!?」』）)]\s*$/.test(normalized)) {
      return true;
    }

    const lines = normalized
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return false;
    }

    const lastLine = lines[lines.length - 1];
    return !/^[-•\d]+[.)、]?\s*$/.test(lastLine);
  }

  async ensureCompleteEnding(text, maxChars, mode, action) {
    const normalized = String(text || "").trim();
    if (!normalized) {
      return normalized;
    }

    if (normalized.length > maxChars) {
      return this.truncateAtSentenceBoundary(normalized, maxChars);
    }

    if (this.isLikelyCompleteEnding(normalized)) {
      return normalized;
    }

    const repairPrompt = `請將以下內容改寫為「完整結尾」版本，必須在 ${maxChars} 字以內。\n\n要求：\n1. 保留原本重點與結構。\n2. 最後一句必須完整收束。\n3. 不要新增與原文無關資訊。\n\n【內容】\n${normalized}`;

    try {
      const repaired = await geminiClient.generateResponse(repairPrompt, [], {
        temperature: 0.2,
        maxOutputTokens: Math.max(
          700,
          Math.min(2048, Math.ceil(maxChars * 1.2)),
        ),
      });

      const fixed = String(repaired || "").trim();
      if (
        fixed &&
        fixed.length <= maxChars &&
        this.isLikelyCompleteEnding(fixed)
      ) {
        return fixed;
      }
    } catch (error) {
      console.warn("結尾修復失敗，沿用安全截斷結果:", error.message);
    }

    return normalized;
  }

  truncateAtSentenceBoundary(text, maxChars) {
    const normalized = String(text || "").trim();
    if (!normalized || normalized.length <= maxChars) {
      return normalized;
    }

    const minLength = Math.max(1, Math.floor(maxChars * 0.85));
    const window = normalized.slice(0, maxChars + 1);

    const explicitBoundaries = [
      "\n\n",
      "\n",
      "。",
      "！",
      "？",
      "；",
      ";",
      "!",
      "?",
    ];
    let bestCut = -1;

    for (const marker of explicitBoundaries) {
      const idx = window.lastIndexOf(marker);
      if (idx >= 0) {
        bestCut = Math.max(bestCut, idx + marker.length);
      }
    }

    if (bestCut >= minLength) {
      return window.slice(0, bestCut).trim();
    }

    const sentenceMatches = [...window.matchAll(/[。！？；!?]+/g)];
    if (sentenceMatches.length > 0) {
      const last = sentenceMatches[sentenceMatches.length - 1];
      const endIndex = (last.index || 0) + last[0].length;
      if (endIndex >= minLength) {
        return window.slice(0, endIndex).trim();
      }
    }

    return window.slice(0, maxChars).trim();
  }

  /**
   * 生成教案分析報告
   * @param {string} lessonContent - 教案內容
   * @param {Object} scores - 評分結果（可選）
   * @returns {Promise<string>} 分析報告
   */
  async generateAnalysisReport(lessonContent, scores = null) {
    try {
      const criteriaContext = this.buildCriteriaContext();

      let prompt = `你是一位專業的教案評論專家。請根據以下評分標準，對教案進行全面分析。\n\n`;
      prompt += `${criteriaContext}\n\n`;
      prompt += `教案內容:\n${lessonContent}\n\n`;

      if (scores) {
        prompt += `已有評分結果:\n${JSON.stringify(scores, null, 2)}\n\n`;
      }

      prompt += `請依照以下格式提供 500 字以內的評論:\n`;
      prompt += `1. 總體評價（50-80字）\n`;
      prompt += `2. 教案優點（3點，每點30-50字）\n`;
      prompt += `3. 教案缺點與待改進之處（3-5點關鍵問題）\n`;
      prompt += `4. 修改建議（具體步驟）\n`;
      prompt += `5. 核心要素檢核（僅列出缺失項目）\n`;

      const response = await geminiClient.generateResponse(prompt);
      return response;
    } catch (error) {
      console.error("生成分析報告失敗:", error);
      throw error;
    }
  }

  /**
   * 建構系統提示詞
   * @returns {string} 系統提示詞
   */
  buildSystemPrompt() {
    return `你是一位專業的教案評論專家，擁有豐富的教學設計經驗。
你的任務是根據提供的評分標準，對教案進行專業、客觀、具建設性的評論。

評論原則:
1. 客觀公正：基於評分標準進行評價
2. 具體明確：提供可操作的改進建議
3. 鼓勵為主：先肯定優點，再指出改進空間
4. 專業詳盡：引用相關教育理論和實踐經驗

回應格式:
- 使用繁體中文
- 條理清晰，分點說明
- 避免過於學術化的用語
- 提供具體的範例和建議`;
  }

  /**
   * 取得所有評分標準
   * @returns {Array} 評分標準陣列
   */
  getAllCriteria() {
    return this.criteria;
  }

  /**
   * 根據 ID 取得特定評分標準
   * @param {string} id - 標準 ID
   * @returns {Object} 評分標準
   */
  getCriterionById(id) {
    return this.criteria.find((c) => c.id === id);
  }
}

// 導出單例
module.exports = new RAGSimpleService();
