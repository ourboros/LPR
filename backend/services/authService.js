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
 * @param {string} guestSessionId - 未登入時的 sessionId，用於遷移舊記錄
 * @returns {Promise<Object>} { token, user }
 */
async function handleGoogleLogin(googleToken, guestSessionId = null) {
  try {
    // 1. 驗證 Google token
    const googleData = await verifyGoogleToken(googleToken);

    // 2. 創建或更新用戶
    const user = await upsertUser(googleData);

    // ✅ 新增：刪除舊的 sessionId 記錄，系統要求用戶重新上傳
    if (guestSessionId) {
      await deleteSessionRecordsAndPrepareForNewLogin(guestSessionId);
    }

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
      // ✅ 新增：返回重定向標記
      shouldRedirectToUpload: !!guestSessionId,
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

/**
 * ✅ 登入清理函數
 * 當用戶登入時，將未登入期間的記錄完全刪除，系統要求用戶重新上傳
 * @param {string} sessionId - 未登入時的 sessionId
 */
async function deleteSessionRecordsAndPrepareForNewLogin(sessionId) {
  try {
    const ReviewRecord = require("../models/ReviewRecord");
    const Lesson = require("../models/Lesson");

    // 1. 刪除評論記錄
    const reviewDeleteResult = await ReviewRecord.deleteMany({
      sessionId: sessionId,
      userId: null, // 只刪除未登入時的記錄
    });

    // 2. 刪除教案記錄
    const lessonDeleteResult = await Lesson.deleteMany({
      sessionId: sessionId,
      userId: null,
    });

    console.info(`[登入清理] 已刪除舊記錄`, {
      sessionId,
      deletedReviewRecords: reviewDeleteResult.deletedCount,
      deletedLessons: lessonDeleteResult.deletedCount,
    });

    return {
      deleted: true,
      reviewRecordsDeleted: reviewDeleteResult.deletedCount,
      lessonsDeleted: lessonDeleteResult.deletedCount,
    };
  } catch (error) {
    // ✅ 刪除失敗不阻止登入流程
    console.error("[登入清理] 失敗:", error.message);
    return {
      deleted: false,
      error: error.message,
    };
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
