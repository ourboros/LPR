module.exports = async (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "教案輔助評論系統",
  });
};
