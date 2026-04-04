(function initializeAuthUi() {
  function getAuthButton() {
    return document.querySelector("[data-auth-button]");
  }

  function getAuthUserLabel() {
    return document.querySelector("[data-auth-user]");
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
      button.textContent = "登出";
      if (userLabel) {
        userLabel.textContent = user?.name
          ? `目前使用者：${user.name}`
          : "已登入";
      }
      return;
    }

    button.textContent = "Google 登入";
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
        window.location.href = "/app/auth.html";
        return;
      }

      if (window.LPRAuth.isAuthenticated()) {
        await window.LPRAuth.logout();
        return;
      }

      window.location.href = "/app/auth.html";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindAuthButton();
    updateAuthUi();

    window.addEventListener("lpr:auth:success", updateAuthUi);
    window.addEventListener("lpr:auth:logout", updateAuthUi);
  });
})();
