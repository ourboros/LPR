const SearchEngineInterface = require("./SearchEngine.interface");

class SimpleSearchEngine extends SearchEngineInterface {
  async initialize() {
    return true;
  }

  extractKeywords(query) {
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

    const lowered = String(query || "").toLowerCase();
    return terms.filter((term) => lowered.includes(term.toLowerCase()));
  }

  async search(query, options = {}) {
    const { criteria = [], limit = criteria.length || 10 } = options;
    const keywords = this.extractKeywords(query);

    if (keywords.length === 0) {
      return criteria.slice(0, limit);
    }

    const scored = criteria
      .map((criterion) => {
        const text =
          `${criterion.title} ${criterion.description} ${criterion.category}`.toLowerCase();
        const score = keywords.reduce(
          (acc, keyword) =>
            text.includes(keyword.toLowerCase()) ? acc + 1 : acc,
          0,
        );

        return { criterion, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.criterion);

    if (scored.length === 0) {
      return criteria.slice(0, limit);
    }

    return scored.slice(0, limit);
  }
}

module.exports = SimpleSearchEngine;
