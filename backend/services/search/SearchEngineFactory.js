const SimpleSearchEngine = require("./SimpleSearchEngine");

class SearchEngineFactory {
  static create(engineType = "simple") {
    switch (engineType) {
      case "simple":
      default:
        return new SimpleSearchEngine();
    }
  }
}

module.exports = SearchEngineFactory;
