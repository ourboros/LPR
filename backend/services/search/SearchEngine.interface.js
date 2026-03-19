class SearchEngineInterface {
  async initialize() {
    throw new Error("initialize() must be implemented");
  }

  async search(query, options) {
    throw new Error("search() must be implemented");
  }
}

module.exports = SearchEngineInterface;
