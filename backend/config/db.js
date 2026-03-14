const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/";
  const dbName = process.env.MONGODB_DB_NAME || "lpr";

  try {
    await mongoose.connect(uri, {
      dbName,
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`MongoDB 連線成功: ${uri}${dbName}`);
  } catch (error) {
    console.error("MongoDB 連線失敗:", error.message);
    throw error;
  }
}

module.exports = { connectDB };
