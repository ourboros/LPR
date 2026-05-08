(function initializeGoogleAuth() {
  const GOOGLE_CLIENT_ID =
    "1093022180573-2a2h5iridfvbjtqbig5av2gto2kqcui1.apps.googleusercontent.com";
  const GOOGLE_GSI_SRC = "https://accounts.google.com/gsi/client";

  const AUTH_STORAGE_KEY = "lprAuthToken";
  const AUTH_USER_KEY = "lprAuthUser";
  const memoryStorage = new Map();
  let googleAuthReadyPromise = null;
  let googleScriptPromise = null;
  let googleInitialized = false;

  function getStorageValue(key) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? "" : value;
    } catch (error) {
      return memoryStorage.get(key) || "";
    }
  }

  function setStorageValue(key, value) {
    const normalizedValue =
      value === null || value === undefined ? "" : String(value);

    if (!normalizedValue) {
      memoryStorage.delete(key);
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        // Ignore storage access failures and fall back to memory.
      }
      return;
    }

    memoryStorage.set(key, normalizedValue);
    try {
      window.localStorage.setItem(key, normalizedValue);
    } catch (error) {
      // Ignore storage access failures and fall back to memory.
    }
  }

  function removeStorageValue(key) {
    memoryStorage.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // Ignore storage access failures and fall back to memory.
    }
  }

  // ============================================
  // Token Management
  // ============================================

  function getAuthToken() {
    return getStorageValue(AUTH_STORAGE_KEY);
  }

  function setAuthToken(token) {
    if (token) {
      setStorageValue(AUTH_STORAGE_KEY, token);
    } else {
      removeStorageValue(AUTH_STORAGE_KEY);
    }
  }

  function clearAuthToken() {
    removeStorageValue(AUTH_STORAGE_KEY);
    removeStorageValue(AUTH_USER_KEY);
  }

  function setAuthUser(user) {
    if (user) {
      setStorageValue(AUTH_USER_KEY, JSON.stringify(user));
    } else {
      removeStorageValue(AUTH_USER_KEY);
    }
  }

  function getAuthUser() {
    const userJson = getStorageValue(AUTH_USER_KEY);
    try {
      return userJson ? JSON.parse(userJson) : null;
    } catch {
      return null;
    }
  }

  function isAuthenticated() {
    return !!getAuthToken();
  }

  // ============================================
  // Google OAuth Integration
  // ============================================

  function loadGoogleScript() {
    if (window.google?.accounts?.id) {
      return Promise.resolve(true);
    }

    if (googleScriptPromise) {
      return googleScriptPromise;
    }

    googleScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(
        `script[src="${GOOGLE_GSI_SRC}"]`,
      );

      const timeoutId = setTimeout(() => {
        reject(new Error("Google 登入元件載入逾時，請檢查網路或重整頁面。"));
      }, 8000);

      function onReady() {
        if (window.google?.accounts?.id) {
          clearTimeout(timeoutId);
          resolve(true);
        }
      }

      function onError() {
        clearTimeout(timeoutId);
        reject(new Error("無法載入 Google 登入元件。"));
      }

      if (existingScript) {
        existingScript.addEventListener("load", onReady, { once: true });
        existingScript.addEventListener("error", onError, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = GOOGLE_GSI_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", onReady, { once: true });
      script.addEventListener("error", onError, { once: true });
      document.head.appendChild(script);
    });

    return googleScriptPromise;
  }

  async function initGoogleAuth() {
    if (googleAuthReadyPromise) {
      return googleAuthReadyPromise;
    }

    googleAuthReadyPromise = (async () => {
      await loadGoogleScript();

      if (!window.google?.accounts?.id) {
        throw new Error("Google 登入元件尚未載入完成");
      }

      if (!googleInitialized) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCallback,
          auto_select: false,
        });
        googleInitialized = true;
      }

      return true;
    })();

    return googleAuthReadyPromise;
  }

  async function renderGoogleSignInButton(container) {
    await initGoogleAuth();

    if (!container || !window.google?.accounts?.id) {
      throw new Error("Google 登入元件尚未載入完成");
    }

    container.innerHTML = "";

    const isSidebarAuth = container.classList.contains("nav-auth-button");
    const containerWidth = container.clientWidth || 0;
    const minWidth = isSidebarAuth ? 170 : 210;
    const maxWidth = isSidebarAuth ? 200 : 320;
    const fallbackWidth = isSidebarAuth ? 190 : 240;
    const buttonWidth = Math.max(
      Math.min(containerWidth || fallbackWidth, maxWidth),
      minWidth,
    );

    window.google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      locale: "zh_TW",
      logo_alignment: "left",
      width: buttonWidth,
    });
  }

  function renderLogoutButton(container) {
    if (!container) {
      return;
    }

    const isUploadAuth = container.classList.contains(
      "upload-auth-inline__button",
    );
    const buttonClass = isUploadAuth
      ? "upload-auth-inline__logout-btn"
      : "nav-auth-logout-btn";

    container.innerHTML = `
      <button type="button" class="${buttonClass}">
        <span>登出</span>
      </button>
    `;

    const button = container.querySelector("button");
    if (button) {
      button.addEventListener("click", async () => {
        await logout();
      });
    }
  }

  async function handleGoogleCallback(response) {
    try {
      const googleToken = response.credential;

      // 將 Google token 發送到後端進行驗證
      const result = await exchangeTokenWithBackend(googleToken);

      if (result.success) {
        // 存儲 JWT token 和用戶信息
        setAuthToken(result.token);
        setAuthUser(result.user);

        // ✅ 新增：如果需要重定向，直接跳轉到上傳頁面
        if (result.shouldRedirectToUpload) {
          // 清空所有本地狀態
          try {
            // 方式1：使用 window.LPR 的方法（如果已加載）
            if (window.LPR?.clearCurrentLesson) {
              window.LPR.clearCurrentLesson();
            }
          } catch (e) {
            console.warn("[登入清理] LPR 清理失敗，嘗試手動清理:", e.message);
          }

          // 方式2：手動清理所有相關 localStorage/sessionStorage
          try {
            // 清空教案相關資訊
            localStorage.removeItem("currentLessonId");
            localStorage.removeItem("lpr.currentLessonId");
            localStorage.removeItem("lpr_current_lesson_id");
            localStorage.removeItem("currentLessonName");
            localStorage.removeItem("lpr.currentLessonName");

            // 清空 guestSessionId（已登入不需要）
            localStorage.removeItem("guestSessionId");
            localStorage.removeItem("lpr.guestSessionId");
            localStorage.removeItem("lpr_session_id");

            // 清空 sessionStorage 中的教案信息
            sessionStorage.removeItem("currentLessonId");
            sessionStorage.removeItem("lpr.currentLessonId");
            sessionStorage.removeItem("currentLessonName");
            sessionStorage.removeItem("lpr.currentLessonName");
          } catch (e) {
            console.warn("[登入清理] Storage 清理失敗:", e.message);
          }

          console.info("[登入清理] 完成，跳轉到上傳頁面");

          // 直接跳轉到上傳頁面
          window.location.href = "/app/upload.html";
          return;
        }

        // 分派登入成功事件（不需要重定向時）
        window.dispatchEvent(
          new CustomEvent("lpr:auth:success", { detail: result.user }),
        );
      }
    } catch (error) {
      console.error("Google 登入失敗:", error);
      window.dispatchEvent(
        new CustomEvent("lpr:auth:error", { detail: error.message }),
      );
    }
  }

  async function exchangeTokenWithBackend(googleToken) {
    const response = await fetch(`${getApiBase()}/api/auth/google-callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ googleToken }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "後端驗證失敗");
    }

    return await response.json();
  }

  // ============================================
  // User Management
  // ============================================

  function getUserInfo() {
    return getAuthUser();
  }

  async function getCurrentUser() {
    const token = getAuthToken();
    if (!token) {
      return null;
    }

    try {
      const response = await fetch(`${getApiBase()}/api/auth/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 401) {
        clearAuthToken();
      }

      return null;
    } catch (error) {
      console.error("獲取用戶信息失敗:", error);
      return null;
    }
  }

  // ============================================
  // Logout
  // ============================================

  async function logout() {
    try {
      const token = getAuthToken();
      if (token) {
        await fetch(`${getApiBase()}/api/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error("登出 API 失敗:", error);
    } finally {
      clearAuthToken();
      window.dispatchEvent(new CustomEvent("lpr:auth:logout"));

      // 保持在目前頁面，由 UI 即時反映登入狀態
    }
  }

  // ============================================
  // UI Helpers
  // ============================================

  function getApiBase() {
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

    return origin || "http://localhost:5000";
  }

  function displayUserInfo(container) {
    const user = getUserInfo();
    if (!user) {
      container.innerHTML = "<p>未登入</p>";
      return;
    }

    container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        ${user.avatar ? `<img src="${user.avatar}" alt="${user.name}" style="width: 32px; height: 32px; border-radius: 50%;" />` : ""}
        <span>${user.name}</span>
        <button onclick="window.LPRAuth.logout()" style="padding: 5px 10px;">登出</button>
      </div>
    `;
  }

  // ============================================
  // Export to Global
  // ============================================

  window.LPRAuth = {
    initGoogleAuth,
    renderGoogleSignInButton,
    renderLogoutButton,
    handleGoogleCallback,
    getAuthToken,
    setAuthToken,
    clearAuthToken,
    isAuthenticated,
    getUserInfo,
    getCurrentUser,
    logout,
    displayUserInfo,
    getApiBase,
  };
})(window);
