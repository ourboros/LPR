(function initializeAuthUi() {
  function getAuthButton() {
    return document.querySelector("[data-auth-button]");
  }

  function getAuthUserLabel() {
    return document.querySelector("[data-auth-user]");
  }

  function setButtonLabel(button, labelText) {
    const label = button.querySelector(".auth-button-label");
    if (label) {
      label.textContent = labelText;
      return;
    }

    button.textContent = labelText;
  }

  function updateAuthUi() {
    const button = getAuthButton();
    const userLabel = getAuthUserLabel();

    if (!button || !window.LPRAuth) {
      return;
    }

    const isLoggedIn = window.LPRAuth.isAuthenticated();
    const user = window.LPRAuth.getUserInfo();

    if (isLoggedIn) {
      setButtonLabel(button, "登出");
      if (userLabel) {
        userLabel.textContent = user?.name
          ? `目前使用者：${user.name}`
          : "已登入";
      }
      return;
    }

    setButtonLabel(button, "Google 登入");
    if (userLabel) {
      userLabel.textContent = "目前未登入";
    }
  }

  function bindAuthButton() {
    const button = getAuthButton();
    if (!button) {
      return;
    }

    button.addEventListener("click", async () => {
      if (!window.LPRAuth) {
        return;
      }

      if (window.LPRAuth.isAuthenticated()) {
        await window.LPRAuth.logout();
        return;
      }

      try {
        await window.LPRAuth.startGoogleLogin();
      } catch (error) {
        console.error("啟動 Google 登入失敗:", error);
        window.dispatchEvent(
          new CustomEvent("lpr:auth:error", { detail: error.message }),
        );
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindAuthButton();
    updateAuthUi();

    window.addEventListener("lpr:auth:success", updateAuthUi);
    window.addEventListener("lpr:auth:logout", updateAuthUi);
  });
})();
