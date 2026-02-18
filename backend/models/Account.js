const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  passwordHash: { type: String, default: null },
  profilePic: { type: String, default: "" },
  bio: { type: String, default: "" },
  followersCount: { type: Number, default: 0 },
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "Account" }],
  botScore: { type: Number, default: 0 },
  behaviorFeatures: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastBehaviorComputedAt: { type: Date, default: null },
});

module.exports = mongoose.model("Account", accountSchema);
