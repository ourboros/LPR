(function initializeAuthUi() {
  function getAuthButton() {
    return document.querySelector("[data-auth-button]");
  }

  function getAuthUserLabel() {
    return document.querySelector("[data-auth-user]");
  }

  async function updateAuthUi() {
    const button = getAuthButton();
    const userLabel = getAuthUserLabel();

    if (!button || !window.LPRAuth) {
      return;
    }

    const isLoggedIn = window.LPRAuth.isAuthenticated();
    const user = window.LPRAuth.getUserInfo();

    if (isLoggedIn) {
      window.LPRAuth.renderLogoutButton(button);
      if (userLabel) {
        userLabel.textContent = user?.name
          ? `目前使用者：${user.name}`
          : "已登入";
      }
      return;
    }

    await window.LPRAuth.renderGoogleSignInButton(button);
    if (userLabel) {
      userLabel.textContent = "目前未登入";
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await updateAuthUi();
    } catch (error) {
      console.error("初始化 Google 登入 UI 失敗:", error);
      window.dispatchEvent(
        new CustomEvent("lpr:auth:error", { detail: error.message }),
      );
    }

    document.body.classList.add("auth-ui-ready");

    window.addEventListener("lpr:auth:success", () => {
      updateAuthUi().catch((error) => {
        console.error("更新登入 UI 失敗:", error);
      });
    });
    window.addEventListener("lpr:auth:logout", () => {
      updateAuthUi().catch((error) => {
        console.error("更新登出 UI 失敗:", error);
      });
    });
  });
})();
