const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null, index: true },
  username: { type: String, default: "", index: true },
  eventType: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },

  postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
  postType: { type: String, enum: ["original", "reply", "repost", ""], default: "" },
  inReplyToPostId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
  originalPostTimestamp: { type: Date, default: null },
  replyTimestamp: { type: Date, default: null },
  latencyMs: { type: Number, default: null },

  ipHash: { type: String, default: "" },
  deviceType: { type: String, enum: ["mobile", "web", "api", "unknown"], default: "unknown" },
  clientVersion: { type: String, default: "" },
  sessionId: { type: String, default: "" },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);

