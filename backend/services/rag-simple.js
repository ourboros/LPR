// ============================================
// 簡化版 RAG 服務（不使用 Embedding）
// ============================================

const fs = require("fs");
const path = require("path");
const geminiClient = require("./geminiClient");

class RAGSimpleService {
  constructor() {
    this.criteria = null;
    this.essentials = null;
    this.guidelines = null;
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
  findRelevantCriteria(query) {
    // 簡化版：返回所有標準（因為不使用向量搜尋）
    // 可以根據關鍵字做簡單過濾
    const keywords = this.extractKeywords(query);

    if (keywords.length === 0) {
      return this.criteria; // 返回全部
    }

    // 簡單的關鍵字匹配
    const relevant = this.criteria.filter((criterion) => {
      const searchText =
        `${criterion.title} ${criterion.description} ${criterion.category}`.toLowerCase();
      return keywords.some((keyword) =>
        searchText.includes(keyword.toLowerCase()),
      );
    });

    // 如果沒有匹配，返回全部
    return relevant.length > 0 ? relevant : this.criteria;
  }

  /**
   * 從問題中提取關鍵字
   * @param {string} query - 用戶問題
   * @returns {Array} 關鍵字陣列
   */
  extractKeywords(query) {
    const keywords = [];
    const terms = [
      "目標",
      "教學目標",
      "教材",
      "教學方法",
      "活動",
      "時間",
      "評量",
      "結構",
      "階段",
      "資源",
      "工具",
      "創意",
      "動機",
      "學生",
      "設計",
    ];

    terms.forEach((term) => {
      if (query.includes(term)) {
        keywords.push(term);
      }
    });

    return keywords;
  }

  /**
   * 生成教案評論
   * @param {string} userMessage - 用戶訊息
   * @param {string} lessonContent - 教案內容（可選）
   * @param {Array} chatHistory - 對話歷史
   * @returns {Promise<Object>} AI 回應
   */
  async generateComment(userMessage, lessonContent = null, chatHistory = []) {
    try {
      const criteriaContext = this.buildCriteriaContext();

      // 建構專業的系統 prompt
      const systemPrompt = `你是一位專業的教案評論專家。

${criteriaContext}

【評論輸出格式】（嚴格遵守）

總字數：500 字以內

結構：
### 總體評價
（50-80字：定位此教案的完整性，如「此教案接近教學大綱而非正式教案」或「此教案架構完整但評量不足」）

### 一、教案優點 (Strengths)
1. **[優點標題]**：描述（30-50字）
2. **[優點標題]**：描述（30-50字）
3. **[優點標題]**：描述（30-50字）

### 二、教案缺點與待改進之處 (Weaknesses)
#### 1. [問題標題] (Missing/Weak [Element])
- **缺失：** 具體說明
- **影響：** 對教學的影響

#### 2. [問題標題]
（重複上述格式，3-5個關鍵問題）

### 三、修改建議 (Modification Suggestions)
#### 1. [建議標題]
具體步驟（條列式）

#### 2. [建議標題]
具體步驟

**總結建議：** 一句話總結核心改進方向

---
**【核心要素檢核】**
✅ 已具備：[列出項目]
❌ 缺失：[列出項目]

【重要規則】
1. 不要逐一評論 11 個評分標準
2. 將問題整合為 3-5 個關鍵缺失（依據五大評鑑面向）
3. 優點最多 3 點，缺點 3-5 點
4. 每個缺點必須指出「缺失」與「影響」
5. 修改建議要具體可執行
6. 核心要素檢核僅列出缺失項目即可（全部具備則省略此段）
7. 語氣專業、明確，避免過度委婉`;

      let fullPrompt = systemPrompt + "\n\n";

      if (lessonContent) {
        fullPrompt += `【教案內容】\n${lessonContent}\n\n`;
      } else {
        fullPrompt += `【教案內容】\n（尚未提供教案內容）\n\n`;
      }

      fullPrompt += `【用戶問題】\n${userMessage}\n\n`;
      fullPrompt += `請依照上述格式提供專業評論。`;

      // 呼叫 Gemini API
      const response = await geminiClient.generateResponse(
        fullPrompt,
        chatHistory,
      );

      return {
        role: "assistant",
        content: response,
        sources: this.findRelevantCriteria(userMessage).map((c) => c.id),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("生成評論失敗:", error);
      throw error;
    }
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
