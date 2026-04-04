(function initializeGoogleAuth() {
  const GOOGLE_CLIENT_ID =
    "1093022180573-2a2h5iridfvbjtqbig5av2gto2kqcui1.apps.googleusercontent.com";

  const AUTH_STORAGE_KEY = "lprAuthToken";
  const AUTH_USER_KEY = "lprAuthUser";

  // ============================================
  // Token Management
  // ============================================

  function getAuthToken() {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  }

  function setAuthToken(token) {
    if (token) {
      localStorage.setItem(AUTH_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  function clearAuthToken() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  }

  function setAuthUser(user) {
    if (user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_USER_KEY);
    }
  }

  function getAuthUser() {
    const userJson = localStorage.getItem(AUTH_USER_KEY);
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

  async function initGoogleAuth() {
    // 等待 Google Sign-In SDK 加載
    return new Promise((resolve) => {
      function checkGoogleReady() {
        if (window.google?.accounts?.id) {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCallback,
          });
          resolve(true);
        } else {
          setTimeout(checkGoogleReady, 100);
        }
      }
      checkGoogleReady();
    });
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

        // 分派登入成功事件
        window.dispatchEvent(
          new CustomEvent("lpr:auth:success", { detail: result.user }),
        );

        // 重定向到上傳頁面（如果在登入頁）
        if (window.location.pathname.includes("auth.html")) {
          setTimeout(() => {
            window.location.href = "/app/upload.html";
          }, 500);
        }
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

      // 重定向到登入頁
      if (!window.location.pathname.includes("auth.html")) {
        window.location.href = "/app/auth.html";
      }
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
