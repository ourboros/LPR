(function initializeLprApi() {
  const DEFAULT_API_ORIGIN = "http://localhost:5000";
  const STORAGE_KEYS = {
    currentLessonId: "currentLessonId",
    currentLessonName: "currentLessonName",
    sidebarCollapsed: "sidebarCollapsed",
  };
  const LEGACY_STORAGE_KEYS = {
    currentLessonId: "lpr.currentLessonId",
    currentLessonName: "lpr.currentLessonName",
    sidebarCollapsed: "lpr.sidebarCollapsed",
  };

  function resolveApiOrigin() {
    const { protocol, hostname, origin, port } = window.location;
    const isLocalHttp =
      protocol.startsWith("http") &&
      ["localhost", "127.0.0.1"].includes(hostname);

    if (isLocalHttp && port === "5000") {
      return origin;
    }

    if (isLocalHttp && port === "3000") {
      return origin;
    }

    if (origin && origin !== "null") {
      return origin;
    }

    return DEFAULT_API_ORIGIN;
  }

  function getStoredValue(primaryKey, legacyKey) {
    const primaryValue = localStorage.getItem(primaryKey);
    if (primaryValue !== null) {
      return primaryValue;
    }

    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue !== null) {
      localStorage.setItem(primaryKey, legacyValue);
      return legacyValue;
    }

    return "";
  }

  function setStoredValue(primaryKey, legacyKey, value) {
    if (value === null || value === undefined || value === "") {
      localStorage.removeItem(primaryKey);
      localStorage.removeItem(legacyKey);
      return;
    }

    localStorage.setItem(primaryKey, String(value));
    localStorage.setItem(legacyKey, String(value));
  }

  async function parseResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "string"
          ? payload
          : payload.error || payload.message || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  const API_ORIGIN = resolveApiOrigin();
  const API_BASE_URL = `${API_ORIGIN}/api`;

  window.LPR = {
    API_BASE_URL,
    buildApiUrl(path) {
      return `${API_BASE_URL}${path}`;
    },
    async request(path, options = {}) {
      const requestOptions = { ...options };
      const headers = new Headers(requestOptions.headers || {});
      const isFormData = requestOptions.body instanceof FormData;
      const isObjectBody =
        requestOptions.body &&
        typeof requestOptions.body === "object" &&
        !isFormData &&
        !(requestOptions.body instanceof Blob);

      if (isObjectBody) {
        headers.set("Content-Type", "application/json");
        requestOptions.body = JSON.stringify(requestOptions.body);
      }

      if (!headers.has("Accept")) {
        headers.set("Accept", "application/json");
      }

      requestOptions.headers = headers;
      const response = await fetch(`${API_BASE_URL}${path}`, requestOptions);
      return parseResponse(response);
    },
    getCurrentLessonId() {
      return getStoredValue(
        STORAGE_KEYS.currentLessonId,
        LEGACY_STORAGE_KEYS.currentLessonId,
      );
    },
    getCurrentLessonName() {
      return getStoredValue(
        STORAGE_KEYS.currentLessonName,
        LEGACY_STORAGE_KEYS.currentLessonName,
      );
    },
    setCurrentLesson(lesson) {
      setStoredValue(
        STORAGE_KEYS.currentLessonId,
        LEGACY_STORAGE_KEYS.currentLessonId,
        lesson?.id ?? "",
      );
      setStoredValue(
        STORAGE_KEYS.currentLessonName,
        LEGACY_STORAGE_KEYS.currentLessonName,
        lesson?.name ?? "",
      );
    },
    clearCurrentLesson() {
      setStoredValue(
        STORAGE_KEYS.currentLessonId,
        LEGACY_STORAGE_KEYS.currentLessonId,
        "",
      );
      setStoredValue(
        STORAGE_KEYS.currentLessonName,
        LEGACY_STORAGE_KEYS.currentLessonName,
        "",
      );
    },
    getSidebarCollapsed() {
      return (
        getStoredValue(
          STORAGE_KEYS.sidebarCollapsed,
          LEGACY_STORAGE_KEYS.sidebarCollapsed,
        ) === "true"
      );
    },
    setSidebarCollapsed(isCollapsed) {
      setStoredValue(
        STORAGE_KEYS.sidebarCollapsed,
        LEGACY_STORAGE_KEYS.sidebarCollapsed,
        String(Boolean(isCollapsed)),
      );
    },
    formatDate(value) {
      if (!value) {
        return "未提供";
      }

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value);
      }

      return date.toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
  };
})();
