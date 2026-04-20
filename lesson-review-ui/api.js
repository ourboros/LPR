(function initializeLprApi() {
  const DEFAULT_API_ORIGIN = "http://localhost:5000";
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
      let detailSuffix = "";

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

        const parts = [];
        if (typeof payload.code === "string" && payload.code) {
          parts.push(`code=${payload.code}`);
        }
        if (typeof payload.hint === "string" && payload.hint) {
          parts.push(`hint=${payload.hint}`);
        }

        const details = payload.details;
        if (details && typeof details === "object") {
          const ratio = Number(details.outsideDiffRatio);
          const threshold = Number(details.outsideThreshold);
          if (Number.isFinite(ratio) && Number.isFinite(threshold)) {
            parts.push(
              `outsideDiff=${ratio.toFixed(4)}/${threshold.toFixed(4)}`,
            );
          }
          const anchoredRatio = Number(details.anchoredOutsideDiffRatio);
          if (Number.isFinite(anchoredRatio)) {
            parts.push(`anchored=${anchoredRatio.toFixed(4)}`);
          }
          const fallbackRatio = Number(details.fallbackOutsideDiffRatio);
          if (Number.isFinite(fallbackRatio)) {
            parts.push(`fallback=${fallbackRatio.toFixed(4)}`);
          }
          if (
            typeof details.candidateSelectionMethod === "string" &&
            details.candidateSelectionMethod
          ) {
            parts.push(`anchor=${details.candidateSelectionMethod}`);
          }
        }

        if (parts.length > 0) {
          detailSuffix = ` (${parts.join(" | ")})`;
        }
      }

      throw new Error(`${message}${detailSuffix}`);
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
