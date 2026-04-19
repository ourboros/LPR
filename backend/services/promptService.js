const fs = require("fs");
const path = require("path");

class PromptService {
  constructor() {
    this.basePath = path.join(__dirname, "../prompts");
    this.cache = new Map();
  }

  loadPrompt(relativePath) {
    const fullPath = path.join(this.basePath, relativePath);

    if (this.cache.has(fullPath)) {
      return this.cache.get(fullPath);
    }

    const content = fs.readFileSync(fullPath, "utf-8").trim();
    this.cache.set(fullPath, content);
    return content;
  }

  getModeTemplate(mode, action) {
    if (mode === "summary") {
      return this.loadPrompt("modes/summary.md");
    }

    if (mode === "quick-action") {
      if (action === "analyze") {
        return this.loadPrompt("modes/quick-analyze.md");
      }

      if (action === "suggest") {
        return this.loadPrompt("modes/quick-suggest.md");
      }

      return this.loadPrompt("modes/quick-summary.md");
    }

    if (mode === "review-formal") {
      return this.loadPrompt("modes/review-formal.md");
    }

    return this.loadPrompt("modes/chat-free.md");
  }

  getModePolicy(mode, action, requestedMaxChars) {
    let maxChars = undefined;
    let maxOutputTokens = 2048;
    let includeCriteria = false;

    if (mode === "summary") {
      maxChars = 500;
      maxOutputTokens = 1024;
      includeCriteria = true;
    } else if (mode === "quick-action") {
      maxChars = 300;
      maxOutputTokens = 700;
      includeCriteria = true;
    } else if (mode === "review-formal") {
      maxChars = undefined;
      maxOutputTokens = 4096;
      includeCriteria = true;
    }

    if (Number.isFinite(requestedMaxChars) && requestedMaxChars > 0) {
      if (maxChars === undefined) {
        maxChars = Math.floor(requestedMaxChars);
      } else {
        maxChars = Math.min(maxChars, Math.floor(requestedMaxChars));
      }
    }

    return {
      maxChars,
      maxOutputTokens,
      includeCriteria,
      action: action || "free",
      mode,
    };
  }

  buildPrompt(options = {}) {
    const {
      mode = "chat-free",
      action = "free",
      userMessage = "",
      lessonContent = "",
      criteriaContext = "",
    } = options;

    const base = this.loadPrompt("base.md");
    const modeTemplate = this.getModeTemplate(mode, action);
    const includeCriteria = this.getModePolicy(mode, action).includeCriteria;

    let prompt = `${base}\n\n${modeTemplate}\n\n`;

    if (includeCriteria && criteriaContext) {
      prompt += `【評鑑參考】\n${criteriaContext}\n\n`;
    }

    if (lessonContent) {
      prompt += `【教案內容】\n${lessonContent}\n\n`;
    } else {
      prompt += "【教案內容】\n（尚未提供教案內容）\n\n";
    }

    prompt += `【使用者需求】\n${userMessage}\n\n`;
    prompt += "請直接輸出最終回覆，不要重述規則。";

    return prompt;
  }
}

module.exports = new PromptService();
