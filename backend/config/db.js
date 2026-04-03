const mongoose = require("mongoose");

let cachedConnection = global.__lprMongoConnection || null;
let cachedPromise = global.__lprMongoPromise || null;

function isSrvUri(uri) {
  return typeof uri === "string" && /^mongodb\+srv:\/\//i.test(uri.trim());
}

function getMongoUri() {
  const uri = process.env.MONGODB_URI;

  if (typeof uri !== "string" || uri.trim() === "") {
    throw new Error("Missing required env: MONGODB_URI");
  }

  return uri.trim();
}

async function connectDB() {
  const uri = getMongoUri();
  const dbName = process.env.MONGODB_DB_NAME || "lpr";
  const connectOptions = {
    dbName,
    serverSelectionTimeoutMS: 5000,
  };

  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  if (cachedPromise) {
    return cachedPromise;
  }

  try {
    cachedPromise = mongoose.connect(uri, connectOptions).then((connection) => {
      cachedConnection = connection;
      global.__lprMongoConnection = connection;
      global.__lprMongoPromise = null;
      return connection;
    });

    global.__lprMongoPromise = cachedPromise;

    await cachedPromise;

    console.log(`MongoDB 連線成功: ${uri} / ${dbName}`);
    return cachedConnection;
  } catch (error) {
    cachedPromise = null;
    global.__lprMongoPromise = null;

    const directUri = process.env.MONGODB_URI_DIRECT;
    const shouldRetryWithDirectUri =
      isSrvUri(uri) &&
      typeof directUri === "string" &&
      directUri.trim() !== "" &&
      directUri !== uri &&
      /querySrv/i.test(error.message);

    if (shouldRetryWithDirectUri) {
      console.warn("MongoDB SRV 解析失敗，改用 MONGODB_URI_DIRECT 重試。");

      await mongoose.connect(directUri, connectOptions);
      console.log(`MongoDB 連線成功: ${directUri} / ${dbName}`);
      return;
    }

    const nodeVersion = process.version;
    console.error("MongoDB 連線失敗:", error.message);
    console.error(
      `偵測到 Node ${nodeVersion}，目前 URI 型態: ${isSrvUri(uri) ? "mongodb+srv" : "mongodb"}`,
    );

    if (/querySrv/i.test(error.message)) {
      console.error(
        "SRV DNS 查詢失敗。這通常是 DNS / 網路限制，不是帳號密碼錯誤，也不太像 Node.js 版本本身造成。",
      );
      console.error(
        "若你的網路無法解析 SRV，請改用 Atlas 的 direct connection string，並填入 MONGODB_URI_DIRECT。",
      );
    }

    throw error;
  }
}

module.exports = { connectDB };
