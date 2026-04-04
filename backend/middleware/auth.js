const jwt = require("jsonwebtoken");

/**
 * 驗證 JWT token 中間件
 * 設置 req.user 對象（如果驗證成功）
 * 支持可選認證（allowGuest=true 時允許無 token 通過）
 */
function verifyTokenMiddleware(options = {}) {
  const { allowGuest = false } = options;

  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      if (allowGuest) {
        req.user = null;
        req.sessionId = req.headers["x-session-id"] || null;
        return next();
      }
      return res.status(401).json({
        error: "缺少授權令牌",
        message: "請將 JWT token 放在 Authorization header 中: Bearer <token>",
      });
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/);
    if (!match) {
      if (allowGuest) {
        req.user = null;
        req.sessionId = req.headers["x-session-id"] || null;
        return next();
      }
      return res.status(401).json({
        error: "無效的授權格式",
        message: "格式應為: Authorization: Bearer <token>",
      });
    }

    const token = match[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      req.sessionId = null;
      next();
    } catch (error) {
      if (allowGuest) {
        req.user = null;
        req.sessionId = req.headers["x-session-id"] || null;
        return next();
      }

      const message =
        error.name === "TokenExpiredError" ? "令牌已過期" : "無效的令牌";

      return res.status(401).json({
        error: "令牌驗證失敗",
        message,
      });
    }
  };
}

/**
 * 強制認證中間件（用於需要登入的端點）
 */
function requireAuthMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "需要登入",
      message: "此操作需要有效的 JWT token",
    });
  }
  next();
}

module.exports = {
  verifyTokenMiddleware,
  requireAuthMiddleware,
};
