const crypto = require("crypto");
const ActivityLog = require("../models/ActivityLog");

function hashIp(ipRaw = "") {
  const salt = process.env.BEHAVIOR_IP_SALT || "loom-behavior-salt";
  return crypto
    .createHash("sha256")
    .update(`${salt}:${String(ipRaw)}`)
    .digest("hex");
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "";
}

function detectDeviceType(userAgent = "") {
  const ua = String(userAgent || "").toLowerCase();
  if (!ua) return "unknown";
  if (ua.includes("postman") || ua.includes("insomnia") || ua.includes("python-requests")) {
    return "api";
  }
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
    return "mobile";
  }
  return "web";
}

async function logActivityEvent({
  req,
  eventType,
  account = null,
  username = "",
  post = null,
  postType = "",
  inReplyToPostId = null,
  originalPostTimestamp = null,
  replyTimestamp = null,
  latencyMs = null,
  metadata = {},
}) {
  try {
    const ipHash = hashIp(getClientIp(req));
    const deviceType = detectDeviceType(req.headers["user-agent"]);
    const clientVersion = String(req.headers["x-client-version"] || "");
    const sessionId = String(req.headers["x-session-id"] || "");

    await ActivityLog.create({
      userId: account?._id || null,
      username: String(username || account?.username || "").toLowerCase(),
      eventType,
      timestamp: new Date(),
      postId: post?._id || null,
      postType,
      inReplyToPostId: inReplyToPostId || null,
      originalPostTimestamp: originalPostTimestamp || null,
      replyTimestamp: replyTimestamp || null,
      latencyMs: typeof latencyMs === "number" ? latencyMs : null,
      ipHash,
      deviceType,
      clientVersion,
      sessionId,
      metadata,
    });
  } catch (err) {
    console.warn("Behavior log failed:", err.message || err);
  }
}

module.exports = {
  logActivityEvent,
  detectDeviceType,
  hashIp,
};

