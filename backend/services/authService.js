const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * 驗證 Google OAuth token
 * @param {string} googleToken - Google 返回的 ID token
 * @returns {Promise<Object>} Google 用戶信息
 */
async function verifyGoogleToken(googleToken) {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      avatar: payload.picture || null,
    };
  } catch (error) {
    throw new Error(`Google token 驗證失敗: ${error.message}`);
  }
}

/**
 * 創建或更新用戶
 * @param {Object} googleData - Google 用戶信息
 * @returns {Promise<Object>} 用戶文檔
 */
async function upsertUser(googleData) {
  try {
    let user = await User.findOne({ googleId: googleData.googleId });

    if (user) {
      // 更新現有用戶
      user.lastLoginAt = new Date();
      await user.save();
    } else {
      // 創建新用戶
      user = new User({
        googleId: googleData.googleId,
        email: googleData.email,
        name: googleData.name,
        avatar: googleData.avatar,
        lastLoginAt: new Date(),
      });
      await user.save();
    }

    return user;
  } catch (error) {
    throw new Error(`用戶保存失敗: ${error.message}`);
  }
}

/**
 * 簽發 JWT token
 * @param {Object} user - 用戶文檔
 * @returns {Object} { token, expiresIn }
 */
function signToken(user) {
  const payload = {
    id: user._id.toString(),
    googleId: user.googleId,
    email: user.email,
    name: user.name,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY || "7d",
  });

  return {
    token,
    expiresIn: process.env.JWT_EXPIRY || "7d",
  };
}

/**
 * 完整的 Google OAuth 登入流程
 * @param {string} googleToken - Google 返回的 ID token
 * @returns {Promise<Object>} { token, user }
 */
async function handleGoogleLogin(googleToken) {
  try {
    // 1. 驗證 Google token
    const googleData = await verifyGoogleToken(googleToken);

    // 2. 創建或更新用戶
    const user = await upsertUser(googleData);

    // 3. 簽發 JWT token
    const { token, expiresIn } = signToken(user);

    return {
      token,
      expiresIn,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        googleId: user.googleId,
      },
    };
  } catch (error) {
    throw error;
  }
}

/**
 * 驗證 JWT token 並返回用戶信息
 * @param {string} token - JWT token
 * @returns {Promise<Object>} 用戶對象
 */
function verifyJWTToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    throw new Error(`JWT 驗證失敗: ${error.message}`);
  }
}

/**
 * 刷新 JWT token
 * @param {Object} user - 用戶對象（從 JWT 解碼）
 * @returns {Object} { token, expiresIn }
 */
async function refreshToken(user) {
  try {
    const dbUser = await User.findById(user.id);
    if (!dbUser) {
      throw new Error("用戶不存在");
    }

    return signToken(dbUser);
  } catch (error) {
    throw error;
  }
}

module.exports = {
  verifyGoogleToken,
  upsertUser,
  signToken,
  handleGoogleLogin,
  verifyJWTToken,
  refreshToken,
};
