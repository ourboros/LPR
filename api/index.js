require("dotenv").config();

const { connectDB } = require("../backend/config/db");
const { createApp } = require("../backend/app");

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      await connectDB();
      return createApp();
    })();
  }

  return appPromise;
}

module.exports = async (req, res) => {
  const app = await getApp();
  return app(req, res);
};
