(function initializeLprApi() {
  const DEFAULT_API_ORIGIN = "http://localhost:5000";
  const memoryStorage = new Map();
  const STORAGE_KEYS = {
    currentLessonId: "currentLessonId",
    currentLessonName: "currentLessonName",
    sidebarCollapsed: "sidebarCollapsed",
    guestSessionId: "guestSessionId",
  };
  const LEGACY_STORAGE_KEYS = {
    currentLessonId: "lpr.currentLessonId",
    currentLessonName: "lpr.currentLessonName",
    sidebarCollapsed: "lpr.sidebarCollapsed",
    guestSessionId: "lpr.guestSessionId",
  };

  function isGuestSessionKey(primaryKey, legacyKey) {
    return (
      primaryKey === STORAGE_KEYS.guestSessionId ||
      legacyKey === LEGACY_STORAGE_KEYS.guestSessionId
    );
  }

  function clearLegacyGuestSessionKeys() {
    removeStorageValue(false, STORAGE_KEYS.guestSessionId);
    removeStorageValue(false, LEGACY_STORAGE_KEYS.guestSessionId);
  }

  function getStorageArea(isSessionStorage) {
    try {
      return isSessionStorage ? window.sessionStorage : window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function storageEntryKey(isSessionStorage, key) {
    return `${isSessionStorage ? "session" : "local"}:${key}`;
  }

  function readStorageValue(isSessionStorage, key) {
    const storage = getStorageArea(isSessionStorage);
    if (storage) {
      try {
        const value = storage.getItem(key);
        return value === null ? "" : value;
      } catch (error) {
        // Ignore storage access failures and fall back to memory.
      }
    }

    return memoryStorage.get(storageEntryKey(isSessionStorage, key)) || "";
  }

  function writeStorageValue(isSessionStorage, key, value) {
    const normalizedValue = value === null || value === undefined ? "" : String(value);
    const storageKey = storageEntryKey(isSessionStorage, key);
    const storage = getStorageArea(isSessionStorage);

    if (!normalizedValue) {
      memoryStorage.delete(storageKey);
      if (storage) {
        try {
          storage.removeItem(key);
        } catch (error) {
          // Ignore storage access failures and fall back to memory.
        }
      }
      return;
    }

    memoryStorage.set(storageKey, normalizedValue);
    if (storage) {
      try {
        storage.setItem(key, normalizedValue);
      } catch (error) {
        // Ignore storage access failures and fall back to memory.
      }
    }
  }

  function removeStorageValue(isSessionStorage, key) {
    const storageKey = storageEntryKey(isSessionStorage, key);
    memoryStorage.delete(storageKey);

    const storage = getStorageArea(isSessionStorage);
    if (!storage) {
      return;
    }

    try {
      storage.removeItem(key);
    } catch (error) {
      // Ignore storage access failures and fall back to memory.
    }
  }

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
    if (isGuestSessionKey(primaryKey, legacyKey)) {
      const primaryValue = readStorageValue(true, primaryKey);
      if (primaryValue !== "") {
        return primaryValue;
      }

      const legacyValue = readStorageValue(true, legacyKey);
      if (legacyValue !== "") {
        writeStorageValue(true, primaryKey, legacyValue);
        removeStorageValue(true, legacyKey);
        return legacyValue;
      }

      return "";
    }

    const primaryValue = readStorageValue(false, primaryKey);
    if (primaryValue !== "") {
      return primaryValue;
    }

    const legacyValue = readStorageValue(false, legacyKey);
    if (legacyValue !== "") {
      writeStorageValue(false, primaryKey, legacyValue);
      return legacyValue;
    }

    return "";
  }

  function setStoredValue(primaryKey, legacyKey, value) {
    if (isGuestSessionKey(primaryKey, legacyKey)) {
      if (value === null || value === undefined || value === "") {
        removeStorageValue(true, primaryKey);
        removeStorageValue(true, legacyKey);
        clearLegacyGuestSessionKeys();
        return;
      }

      writeStorageValue(true, primaryKey, value);
      removeStorageValue(true, legacyKey);
      clearLegacyGuestSessionKeys();
      return;
    }

    if (value === null || value === undefined || value === "") {
      removeStorageValue(false, primaryKey);
      removeStorageValue(false, legacyKey);
      return;
    }

    writeStorageValue(false, primaryKey, value);
    writeStorageValue(false, legacyKey, value);
  }

  function createApiError(message, response, payload) {
    const error = new Error(message);
    error.status = response.status;

    if (payload && typeof payload === "object") {
      if (typeof payload.code === "string" && payload.code) {
        error.code = payload.code;
      }

      if (typeof payload.hint === "string" && payload.hint) {
        error.hint = payload.hint;
      }

      if (payload.details && typeof payload.details === "object") {
        error.details = payload.details;
      }
    }

    return error;
  }

  async function parseResponse(response) {
    const responseSessionId = response.headers.get("x-session-id");
    if (responseSessionId) {
      setStoredValue(
        STORAGE_KEYS.guestSessionId,
        LEGACY_STORAGE_KEYS.guestSessionId,
        responseSessionId,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      let message = `HTTP ${response.status}`;

      if (typeof payload === "string") {
        message = payload;
      } else if (payload && typeof payload === "object") {
        const rawMessage = payload.message ?? payload.error;
        if (typeof rawMessage === "string") {
          message = rawMessage;
        } else if (rawMessage && typeof rawMessage === "object") {
          message =
            rawMessage.message || rawMessage.code || JSON.stringify(rawMessage);
        } else {
          message = JSON.stringify(payload);
        }

        throw createApiError(message, response, payload);
      }

      throw createApiError(message, response, payload);
    }

    return payload;
  }

  const API_ORIGIN = resolveApiOrigin();
  const API_BASE_URL = `${API_ORIGIN}/api`;

  // 兼容舊版本：移除 localStorage 的 guest session，避免重開瀏覽器仍延續舊會話
  clearLegacyGuestSessionKeys();

  window.LPR = {
    API_BASE_URL,
    buildApiUrl(path) {
      return `${API_BASE_URL}${path}`;
    },
    getSessionValue(primaryKey, legacyKey) {
      return getStoredValue(primaryKey, legacyKey);
    },
    setSessionValue(primaryKey, legacyKey, value) {
      setStoredValue(primaryKey, legacyKey, value);
    },
    removeSessionValue(primaryKey, legacyKey) {
      removeStorageValue(true, primaryKey);
      removeStorageValue(true, legacyKey);
    },
    getLocalValue(primaryKey, legacyKey) {
      return getStoredValue(primaryKey, legacyKey);
    },
    setLocalValue(primaryKey, legacyKey, value) {
      setStoredValue(primaryKey, legacyKey, value);
    },
    removeLocalValue(primaryKey, legacyKey) {
      removeStorageValue(false, primaryKey);
      removeStorageValue(false, legacyKey);
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

      const authToken = window.LPRAuth?.getAuthToken?.();
      if (authToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${authToken}`);
      }

      const guestSessionId = getStoredValue(
        STORAGE_KEYS.guestSessionId,
        LEGACY_STORAGE_KEYS.guestSessionId,
      );
      if (guestSessionId && !headers.has("x-session-id")) {
        headers.set("x-session-id", guestSessionId);
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
    isAuthenticated() {
      return Boolean(window.LPRAuth?.isAuthenticated?.());
    },
    getUserInfo() {
      return window.LPRAuth?.getUserInfo?.() || null;
    },
    async closeGuestSession() {
      const guestSessionId = getStoredValue(
        STORAGE_KEYS.guestSessionId,
        LEGACY_STORAGE_KEYS.guestSessionId,
      );

      if (!guestSessionId) {
        return { success: true, skipped: true };
      }

      if (window.LPRAuth?.isAuthenticated?.()) {
        return { success: true, skipped: true };
      }

      const response = await fetch(
        `${API_BASE_URL}/upload/guest-session/close`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-id": guestSessionId,
          },
          body: JSON.stringify({ sessionId: guestSessionId }),
        },
      );

      if (response.ok) {
        setStoredValue(
          STORAGE_KEYS.guestSessionId,
          LEGACY_STORAGE_KEYS.guestSessionId,
          "",
        );
      }

      return parseResponse(response);
    },
    logout() {
      return window.LPRAuth?.logout?.();
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
