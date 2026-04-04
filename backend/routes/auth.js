const express = require("express");
const router = express.Router();
const authService = require("../services/authService");
const {
  verifyTokenMiddleware,
  requireAuthMiddleware,
} = require("../middleware/auth");

/**
 * POST /api/auth/google-callback
 * 處理 Google OAuth 回調
 * 期望 body: { googleToken: "..." }
 */
router.post("/google-callback", async (req, res) => {
  try {
    const { googleToken } = req.body;

    if (!googleToken) {
      return res.status(400).json({
        error: "缺少 googleToken",
        message: "請提供 Google ID token",
      });
    }

    const result = await authService.handleGoogleLogin(googleToken);

    res.json({
      success: true,
      token: result.token,
      expiresIn: result.expiresIn,
      user: result.user,
    });
  } catch (error) {
    console.error("Google 登入失敗:", error);
    res.status(401).json({
      error: "Google 登入失敗",
      message: error.message,
    });
  }
});

/**
 * GET /api/auth/user
 * 獲取當前登入用戶信息
 * 需要有效的 JWT token
 */
router.get(
  "/user",
  verifyTokenMiddleware(),
  requireAuthMiddleware,
  async (req, res) => {
    try {
      res.json({
        success: true,
        user: req.user,
      });
    } catch (error) {
      console.error("獲取用戶信息失敗:", error);
      res.status(500).json({
        error: "獲取用戶信息失敗",
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/auth/refresh-token
 * 刷新 JWT token
 * 需要有效的 JWT token
 */
router.post(
  "/refresh-token",
  verifyTokenMiddleware(),
  requireAuthMiddleware,
  async (req, res) => {
    try {
      const result = await authService.refreshToken(req.user);

      res.json({
        success: true,
        token: result.token,
        expiresIn: result.expiresIn,
      });
    } catch (error) {
      console.error("刷新令牌失敗:", error);
      res.status(401).json({
        error: "刷新令牌失敗",
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/auth/logout
 * 登出（可選，主要由前端清除 token）
 */
router.post(
  "/logout",
  verifyTokenMiddleware({ allowGuest: true }),
  async (req, res) => {
    try {
      // 後端邏輯：可選擇將 token 加入黑名單或其他
      // 目前主要由前端清除 localStorage 中的 token

      res.json({
        success: true,
        message: "登出成功",
      });
    } catch (error) {
      console.error("登出失敗:", error);
      res.status(500).json({
        error: "登出失敗",
        message: error.message,
      });
    }
  },
);

module.exports = router;
