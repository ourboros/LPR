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

    // ✅ 新增：遷移舊的 sessionId 記錄到 userId
    if (guestSessionId) {
      await migrateSessionRecordsToUser(guestSessionId, user._id);
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
 * ✅ SessionID 遷移函數
 * 當用戶登入時，將未登入期間（使用 sessionId）的評論記錄遷移到已登入用戶（使用 userId）
 * @param {string} sessionId - 未登入時的 sessionId
 * @param {string} userId - 登入後的 userId
 */
async function migrateSessionRecordsToUser(sessionId, userId) {
  try {
    const ReviewRecord = require("../models/ReviewRecord");

    // 1. 查找舊的 sessionId 記錄
    const oldRecords = await ReviewRecord.find({
      sessionId: sessionId,
      userId: null, // 只遷移未登入時的記錄
    });

    if (oldRecords.length === 0) {
      console.info(
        `[SessionID 遷移] 未找到 sessionId=${sessionId} 的記錄，跳過遷移`,
      );
      return { migrated: 0, deleted: 0 };
    }

    console.info(
      `[SessionID 遷移] 發現 ${oldRecords.length} 條舊記錄，開始遷移...`,
      {
        sessionId,
        userId,
      },
    );

    // 2. 遷移記錄：清除 sessionId，設置 userId
    const updateResult = await ReviewRecord.updateMany(
      {
        sessionId: sessionId,
        userId: null,
      },
      {
        $set: {
          userId: userId,
          sessionId: null, // ✅ 清除 sessionId，實現登入後的隔離
          migratedAt: new Date(),
          previousSessionId: sessionId, // ✅ 保留來源 sessionId 用於追蹤
        },
      },
    );

    console.info(`[SessionID 遷移] 完成`, {
      sessionId,
      userId,
      migratedCount: updateResult.modifiedCount,
    });

    return {
      migrated: updateResult.modifiedCount,
      deleted: 0,
    };
  } catch (error) {
    // ✅ 遷移失敗不影響登入流程
    console.error("[SessionID 遷移] 失敗:", error.message);
    return { migrated: 0, deleted: 0 };
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
