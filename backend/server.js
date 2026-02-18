require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodeFetch = require("node-fetch");
const FormData = require("form-data");
const crypto = require("crypto");

const Post = require("./models/Post");
const Account = require("./models/Account");
const ActivityLog = require("./models/ActivityLog");
const { logActivityEvent } = require("./services/behaviorTracking");
const { runBehaviorAnalysisBatch } = require("./services/behaviorAnalysis");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;

  const [salt, keyHex] = storedHash.split(":");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(keyHex, "hex");

  if (derivedKey.length !== keyBuffer.length) return false;
  return crypto.timingSafeEqual(derivedKey, keyBuffer);
}

function escapeRegex(text = "") {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createAdminSessionToken() {
  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return token;
}

function isValidAdminSession(token = "") {
  const expiry = adminSessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req, res, next) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Admin authorization required" });
  }
  const token = auth.slice("Bearer ".length).trim();
  if (!isValidAdminSession(token)) {
    return res.status(403).json({ error: "Invalid or expired admin session" });
  }
  next();
}

async function ensureAdminAccount() {
  const usernameRegex = new RegExp(`^${escapeRegex(ADMIN_USERNAME)}$`, "i");
  const existing = await Account.findOne({ username: usernameRegex });
  if (!existing) {
    await Account.create({
      username: ADMIN_USERNAME,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      role: "admin",
      bio: "Loom platform administrator",
      profilePic: "",
      followersCount: 0,
      following: [],
    });
    console.log("Admin account seeded");
    return;
  }
  if (existing.role !== "admin") {
    existing.role = "admin";
    await existing.save();
  }
}

// =============================
// ENV
// =============================

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8001";
const HF_API_TOKEN = process.env.HF_API_TOKEN;
const HF_MODEL_URL = "https://router.huggingface.co/hf-inference/models/umm-maybe/AI-image-detector";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "loomadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "loomadmin";
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const adminSessions = new Map();

// =============================
// DATABASE
// =============================

if (!MONGODB_URI) {
  console.error("❌ Missing MONGODB_URI in .env");
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log("MongoDB connected");
    await ensureAdminAccount();
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// =============================
// AI DETECTION PROXY
// =============================

app.post("/api/check-ai", async (req, res) => {
  try {
    const { imageData } = req.body;
    if (!imageData)
      return res.status(400).json({ error: "No image data provided" });

    if (!HF_API_TOKEN) {
      return res.status(503).json({ error: "HF_API_TOKEN not configured" });
    }

    const imageBuffer = Buffer.from(imageData, "base64");
    console.log("🔍 Checking AI with Hugging Face...");

    const hfResponse = await nodeFetch(HF_MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_TOKEN}`,
        "Content-Type": "application/octet-stream",
      },
      body: imageBuffer,
      timeout: 30000,
    });

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      console.error(`HF API error ${hfResponse.status}:`, errorText);
      return res.status(502).json({ error: "HF API failed", detail: errorText });
    }

    const result = await hfResponse.json();
    console.log("✅ AI check complete");
    res.json(result);
  } catch (err) {
    console.error("AI check error:", err.message);
    res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

// =============================
// ML TAGGING PROXY
// =============================

app.post("/api/analyze", async (req, res) => {
  try {
    const { imageData } = req.body;
    if (!imageData)
      return res.status(400).json({ error: "No image data provided" });

    const imageBuffer = Buffer.from(imageData, "base64");

    const form = new FormData();
    form.append("image", imageBuffer, {
      filename: "artwork.jpg",
      contentType: "image/jpeg",
    });

    const mlResponse = await nodeFetch(`${ML_SERVICE_URL}/tagging/analyze`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    });

    if (!mlResponse.ok) {
      const err = await mlResponse.text();
      console.error("ML analyze error:", err);
      return res.status(502).json({ error: "ML service failed" });
    }

    const result = await mlResponse.json();
    res.json(result);
  } catch (err) {
    console.error("Analyze crash:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// GET ACCOUNT BY ID
// =============================

app.get("/api/accounts/id/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const account = await Account.findById(id);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    res.json(account);
  } catch (err) {
    console.error("Get Account By ID Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// FYP RECOMMENDATIONS
// =============================

app.get("/api/fyp", async (req, res) => {
  try {
    const { username } = req.query;
    const normalizedUsername = String(username || "").trim().toLowerCase();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Cap at 100 for safety

    let query = {};
    if (normalizedUsername && normalizedUsername !== "undefined" && normalizedUsername !== "null") {
      query = {
        user: { $ne: normalizedUsername },
        likedBy: { $ne: normalizedUsername },
      };
    }

    const posts = await Post.find(query).sort({ date: -1 }).lean();

    if (!posts.length) return res.json([]);

    const serializedPosts = posts.map((p) => ({
      ...p,
      _id: p._id.toString(),
      artistId: p.artistId?.toString(),
      mlTags: p.mlTags || {},
    }));

    let recommended = null;
    let interactionHistory = [];
    let followedArtistIds = [];
    let viewerBehaviorStats = {};
    let creatorBehaviorStats = {};

    if (normalizedUsername) {
      const usernameRegex = new RegExp(`^${escapeRegex(normalizedUsername)}$`, "i");
      const account = await Account.findOne({ username: usernameRegex }).lean();
      followedArtistIds = (account?.following || []).map((id) => String(id));
      viewerBehaviorStats = {
        bot_score: Number(account?.botScore || 0),
        behavior_features: account?.behaviorFeatures || {},
      };

      // Build affinity interactions from existing likes/comments.
      interactionHistory = serializedPosts.flatMap((post) => {
        const events = [];
        if ((post.likedBy || []).map((u) => String(u).toLowerCase()).includes(normalizedUsername)) {
          events.push({ weight: 1.0, tags: post.mlTags || {} });
        }
        const ownComments = (post.comments || []).filter(
          (c) => String(c?.user || "").toLowerCase() === normalizedUsername
        );
        ownComments.forEach(() => {
          events.push({ weight: 0.85, tags: post.mlTags || {} });
        });
        return events;
      });
    }

    // Per-artist behavior stats for quality-aware ranking in recommendation.py
    const artistIds = [
      ...new Set(
        serializedPosts
          .map((p) => String(p?.artistId || ""))
          .filter(Boolean)
      ),
    ];
    if (artistIds.length) {
      const creatorAccounts = await Account.find(
        { _id: { $in: artistIds } },
        "_id botScore behaviorFeatures"
      ).lean();
      creatorBehaviorStats = creatorAccounts.reduce((acc, a) => {
        const key = String(a?._id || "");
        if (!key) return acc;
        acc[key] = {
          bot_score: Number(a?.botScore || 0),
          behavior_features: a?.behaviorFeatures || {},
        };
        return acc;
      }, {});
    }

    try {
      const pyResponse = await nodeFetch(`${ML_SERVICE_URL}/recommendation/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posts: serializedPosts,
          user_id: normalizedUsername || null,
          interaction_history: interactionHistory,
          followed_artist_ids: followedArtistIds,
          viewer_behavior_stats: viewerBehaviorStats,
          creator_behavior_stats: creatorBehaviorStats,
          top_n: limit,
        }),
      });

      if (!pyResponse.ok) {
        console.warn("⚠️ Recommendation service returned non-OK status. Using fallback.");
      } else {
        recommended = await pyResponse.json();
      }
    } catch (fetchErr) {
      console.warn("⚠️ Recommendation service unreachable — using fallback.", fetchErr.message || fetchErr);
    }

    // If ML service failed or returned non-OK, use the simple fallback
    if (!recommended) return res.json(serializedPosts.slice(0, limit));

    res.json(recommended);
  } catch (err) {
    console.error("FYP Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// INTERACTION TRACKING
// =============================

app.post("/api/interaction", async (req, res) => {
  try {
    const { username, postId, type } = req.body;

    if (!username || !postId || !type)
      return res.status(400).json({ error: "username, postId, type required" });

    const allPosts = await Post.find({}, "_id").lean();
    const allPostIds = allPosts.map((p) => p._id.toString());

    await nodeFetch(`${ML_SERVICE_URL}/recommendation/interaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: username,
        post_id: postId,
        interaction_type: type,
        all_post_ids: allPostIds,
      }),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Interaction Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// POSTS
// =============================

app.get("/api/posts", async (req, res) => {
  try {
    const posts = await Post.find().sort({ date: -1 });
    res.json(posts);
  } catch (err) {
    console.error("Get Posts Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/posts", async (req, res) => {
  try {
    const {
      user,
      artistId,
      url,
      title,
      description,
      tags,
      mlTags,
      medium,
      postType,
      inReplyToPostId,
    } = req.body;

    if (!user || !url)
      return res.status(400).json({ error: "user and url required" });

    let resolvedArtistId = artistId;
    const resolvedPostType = ["original", "reply", "repost"].includes(postType)
      ? postType
      : "original";
    let resolvedInReplyToPostId = null;
    let parentPostTimestamp = null;

    if (!resolvedArtistId) {
      const account = await Account.findOneAndUpdate(
        { username: user },
        { $setOnInsert: { username: user } },
        { new: true, upsert: true }
      );
      resolvedArtistId = account._id;
    }

    if (resolvedPostType === "reply" && inReplyToPostId && mongoose.Types.ObjectId.isValid(inReplyToPostId)) {
      const parentPost = await Post.findById(inReplyToPostId, "date").lean();
      if (parentPost) {
        resolvedInReplyToPostId = parentPost._id;
        parentPostTimestamp = parentPost.date || null;
      }
    }

    const newPost = await Post.create({
      artistId: resolvedArtistId,
      user,
      postType: resolvedPostType,
      inReplyToPostId: resolvedInReplyToPostId,
      originalPostTimestamp: parentPostTimestamp,
      url,
      title: title?.trim() || "",
      description: description?.trim() || "",
      tags: Array.isArray(tags) ? tags : [],
      mlTags: mlTags || {},
      medium,
      likedBy: [],
    });

    const account = await Account.findById(resolvedArtistId, "_id username").lean();
    await logActivityEvent({
      req,
      eventType:
        resolvedPostType === "reply"
          ? "post_reply"
          : resolvedPostType === "repost"
          ? "post_repost"
          : "post_create",
      account,
      username: user,
      post: newPost,
      postType: resolvedPostType,
      inReplyToPostId: resolvedInReplyToPostId,
      originalPostTimestamp: parentPostTimestamp,
      replyTimestamp: resolvedPostType === "reply" ? new Date() : null,
      latencyMs:
        resolvedPostType === "reply" && parentPostTimestamp
          ? Date.now() - new Date(parentPostTimestamp).getTime()
          : null,
      metadata: {
        medium: medium || "",
        hasMlTags: Boolean(mlTags && Object.keys(mlTags).length),
      },
    });

    res.status(201).json(newPost);
  } catch (err) {
    console.error("Create Post Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// LIKE POST
// =============================

app.patch("/api/posts/:id/like", async (req, res) => {
  try {
    const { id } = req.params;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username required" });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const alreadyLiked = post.likedBy
      .map(u => u.toLowerCase())
      .includes(normalizedUsername);


    let updatedPost;

    if (alreadyLiked) {
      // 🔥 UNLIKE
      updatedPost = await Post.findByIdAndUpdate(
        id,
        {
          $pull: { likedBy: normalizedUsername },
          $inc: { likes: -1 }
        },
        { new: true }
      );

    } else {
      // 🔥 LIKE
      updatedPost = await Post.findByIdAndUpdate(
        id,
        {
          $addToSet: { likedBy: normalizedUsername },
          $inc: { likes: 1 }
        },
        { new: true }
      );
    }

    if (!alreadyLiked) {
      try {
        const allPosts = await Post.find({}, "_id").lean();
        const allPostIds = allPosts.map((p) => p._id.toString());
        await nodeFetch(`${ML_SERVICE_URL}/recommendation/interaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: normalizedUsername,
            post_id: String(id),
            interaction_type: "like",
            all_post_ids: allPostIds,
          }),
        });
      } catch (mlErr) {
        console.warn("Like interaction tracking failed:", mlErr.message || mlErr);
      }
    }

    const likeAccount = await Account.findOne(
      { username: new RegExp(`^${escapeRegex(normalizedUsername)}$`, "i") },
      "_id username"
    ).lean();
    await logActivityEvent({
      req,
      eventType: alreadyLiked ? "unlike" : "like",
      account: likeAccount,
      username: normalizedUsername,
      post: updatedPost,
      postType: updatedPost?.postType || "original",
      inReplyToPostId: updatedPost?.inReplyToPostId || null,
      originalPostTimestamp: updatedPost?.originalPostTimestamp || null,
      metadata: { alreadyLiked },
    });

    res.json(updatedPost);

  } catch (err) {
    console.error("Like Toggle Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// DELETE POST
// =============================

app.delete("/api/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, artistId } = req.body || {};

    if (!username && !artistId) {
      return res.status(400).json({ error: "username or artistId required" });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const postUsername = String(post.user || "").trim().toLowerCase();
    const postArtistId = post.artistId ? String(post.artistId) : "";
    const requesterUsername = String(username || "").trim().toLowerCase();
    const requesterArtistId = artistId ? String(artistId) : "";

    const isOwner =
      (requesterUsername && postUsername && requesterUsername === postUsername) ||
      (requesterArtistId && postArtistId && requesterArtistId === postArtistId);

    if (!isOwner) {
      return res.status(403).json({ error: "Not authorized to delete" });
    }

    await Post.findByIdAndDelete(id);
    return res.json({ ok: true, deletedId: id });
  } catch (err) {
    console.error("Delete Post Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// AUTH
// =============================

app.post("/api/auth/register", async (req, res) => {
  try {
    const usernameRaw = (req.body.username || "").trim();
    const emailRaw = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";

    if (!usernameRaw || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (String(usernameRaw).toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
      return res.status(403).json({ error: "This username is reserved" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const usernameRegex = new RegExp(`^${escapeRegex(usernameRaw)}$`, "i");

    const existingUsername = await Account.findOne({ username: usernameRegex });
    if (existingUsername) {
      return res.status(409).json({ error: "Username is taken, choose another" });
    }

    if (emailRaw) {
      const existingEmail = await Account.findOne({ email: emailRaw });
      if (existingEmail) {
        return res.status(409).json({ error: "Email already registered" });
      }
    }

    const newAccount = await Account.create({
      username: usernameRaw,
      email: emailRaw || undefined,
      passwordHash: hashPassword(password),
      profilePic: "",
      bio: "",
      followersCount: 0,
      following: [],
    });

    return res.status(201).json({
      message: "Sign up successful",
      user: {
        id: newAccount._id,
        username: newAccount.username,
        email: newAccount.email || null,
      },
    });
  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const usernameRaw = (req.body.username || "").trim();
    const password = req.body.password || "";

    if (!usernameRaw || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const normalizedUsername = usernameRaw.toLowerCase();
    if (normalizedUsername === ADMIN_USERNAME.toLowerCase() && password === ADMIN_PASSWORD) {
      const adminAccount = await Account.findOne({
        username: new RegExp(`^${escapeRegex(ADMIN_USERNAME)}$`, "i"),
      }).lean();
      const adminToken = createAdminSessionToken();
      return res.json({
        message: "Admin login successful",
        user: {
          id: adminAccount?._id || "admin",
          username: ADMIN_USERNAME,
          role: "admin",
          email: adminAccount?.email || null,
          adminToken,
        },
      });
    }

    const usernameRegex = new RegExp(`^${escapeRegex(usernameRaw)}$`, "i");

    const account = await Account.findOne({
      $or: [{ username: usernameRegex }, { email: usernameRaw.toLowerCase() }],
    });

    if (!account || !verifyPassword(password, account.passwordHash)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    await logActivityEvent({
      req,
      eventType: "login",
      account,
      username: account.username,
      metadata: { via: "password" },
    });

    return res.json({
      message: "Login successful",
      user: {
        id: account._id,
        username: account.username,
        email: account.email || null,
        role: account.role || "user",
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// ADD COMMENT TO POST
// =============================

app.post("/api/posts/:id/comment", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, text } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: "username and text required" });
    }

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: "Post not found" });

    const comment = {
      user: username,
      text: String(text),
      createdAt: new Date(),
    };

    const updated = await Post.findByIdAndUpdate(
      id,
      { $push: { comments: comment } },
      { new: true }
    );

    try {
      const allPosts = await Post.find({}, "_id").lean();
      const allPostIds = allPosts.map((p) => p._id.toString());
      await nodeFetch(`${ML_SERVICE_URL}/recommendation/interaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: String(username).toLowerCase(),
          post_id: String(id),
          interaction_type: "comment",
          all_post_ids: allPostIds,
        }),
      });
    } catch (mlErr) {
      console.warn("Comment interaction tracking failed:", mlErr.message || mlErr);
    }

    const commentAccount = await Account.findOne(
      { username: new RegExp(`^${escapeRegex(String(username))}$`, "i") },
      "_id username"
    ).lean();
    const parentTimestamp = post?.date ? new Date(post.date) : null;
    await logActivityEvent({
      req,
      eventType: "comment_create",
      account: commentAccount,
      username,
      post: updated,
      postType: "reply",
      inReplyToPostId: post?._id || null,
      originalPostTimestamp: parentTimestamp,
      replyTimestamp: comment.createdAt,
      latencyMs: parentTimestamp ? comment.createdAt.getTime() - parentTimestamp.getTime() : null,
      metadata: { textLength: String(text).length },
    });

    res.json(updated);
  } catch (err) {
    console.error("Add Comment Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// =============================
// ACCOUNTS
// =============================

app.patch("/api/accounts/:id/profile-pic", async (req, res) => {
  try {
    const { id } = req.params;
    const { actorAccountId, profilePic } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid target account ID" });
    }

    if (!mongoose.Types.ObjectId.isValid(actorAccountId || "")) {
      return res.status(400).json({ error: "Invalid actor account ID" });
    }

    if (String(id) !== String(actorAccountId)) {
      return res.status(403).json({ error: "You can only update your own profile picture" });
    }

    if (!profilePic || typeof profilePic !== "string") {
      return res.status(400).json({ error: "profilePic is required" });
    }

    const updated = await Account.findByIdAndUpdate(
      id,
      { profilePic },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Account not found" });
    res.json(updated);
  } catch (err) {
    console.error("Profile Pic Update Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/accounts/:username", async (req, res) => {
  try {
    const { username } = req.params;

    let account = await Account.findOne({ username });
    if (!account) account = await Account.create({ username });

    res.json(account);
  } catch (err) {
    console.error("Account Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// FOLLOW / UNFOLLOW
// =============================

app.patch("/api/accounts/:username/follow", async (req, res) => {
  try {
    const { username } = req.params; // target to be followed/unfollowed
    const { follower } = req.body; // who is performing the action

    if (!follower || !username) {
      return res.status(400).json({ error: "follower and username required" });
    }

    // Ensure both accounts exist (create follower on demand)
    const target = await Account.findOne({ username });
    if (!target) return res.status(404).json({ error: "Target account not found" });

    const followerAccount = await Account.findOneAndUpdate(
      { username: follower },
      { $setOnInsert: { username: follower } },
      { new: true, upsert: true }
    );

    const targetId = target._id;
    const alreadyFollowing = (followerAccount.following || []).some((id) => String(id) === String(targetId));

    let updatedFollower, updatedTarget;

    if (alreadyFollowing) {
      // unfollow
      updatedFollower = await Account.findByIdAndUpdate(
        followerAccount._id,
        { $pull: { following: targetId } },
        { new: true }
      );
      updatedTarget = await Account.findByIdAndUpdate(
        targetId,
        { $inc: { followersCount: -1 } },
        { new: true }
      );
    } else {
      // follow
      updatedFollower = await Account.findByIdAndUpdate(
        followerAccount._id,
        { $addToSet: { following: targetId } },
        { new: true }
      );
      updatedTarget = await Account.findByIdAndUpdate(
        targetId,
        { $inc: { followersCount: 1 } },
        { new: true }
      );
    }

    await logActivityEvent({
      req,
      eventType: alreadyFollowing ? "unfollow" : "follow",
      account: followerAccount,
      username: follower,
      metadata: {
        targetUsername: username,
        targetId: String(targetId),
      },
    });

    res.json({ target: updatedTarget, follower: updatedFollower, isFollowing: !alreadyFollowing });
  } catch (err) {
    console.error("Follow Toggle Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// CREATE ACCOUNT
// =============================

app.post("/api/accounts", async (req, res) => {
  try {
    const { username, bio, followersCount } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ error: "Username required" });
    }

    const existing = await Account.findOne({ username: username.trim() });
    if (existing) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const newAccount = await Account.create({
      username: username.trim(),
      profilePic: "",
      bio: bio || "",
      followersCount: followersCount || 0,
      following: [],
    });

    res.status(201).json(newAccount);
  } catch (err) {
    console.error("Create Account Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// ADMIN PORTAL
// =============================

app.get("/api/admin/accounts", requireAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

    const query = {};
    if (search) {
      query.username = new RegExp(escapeRegex(search), "i");
    }

    const total = await Account.countDocuments(query);
    const accounts = await Account.find(
      query,
      "_id username bio followersCount following botScore behaviorFeatures lastBehaviorComputedAt createdAt"
    )
      .sort({ username: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const accountIds = accounts.map((a) => a._id);

    const postStats = await Post.aggregate([
      { $match: { artistId: { $in: accountIds } } },
      {
        $project: {
          artistId: 1,
          likes: { $ifNull: ["$likes", 0] },
          commentsCount: { $size: { $ifNull: ["$comments", []] } },
        },
      },
      {
        $group: {
          _id: "$artistId",
          postsCount: { $sum: 1 },
          likesReceived: { $sum: "$likes" },
          commentsReceived: { $sum: "$commentsCount" },
        },
      },
    ]);

    const activityStats = await ActivityLog.aggregate([
      { $match: { userId: { $in: accountIds } } },
      {
        $group: {
          _id: "$userId",
          totalEvents: { $sum: 1 },
          likesGiven: { $sum: { $cond: [{ $eq: ["$eventType", "like"] }, 1, 0] } },
          commentsMade: { $sum: { $cond: [{ $eq: ["$eventType", "comment_create"] }, 1, 0] } },
          followsGiven: { $sum: { $cond: [{ $eq: ["$eventType", "follow"] }, 1, 0] } },
          lastActiveAt: { $max: "$timestamp" },
        },
      },
    ]);

    const postMap = new Map(postStats.map((s) => [String(s._id), s]));
    const activityMap = new Map(activityStats.map((s) => [String(s._id), s]));

    const items = accounts.map((account) => {
      const id = String(account._id);
      const ps = postMap.get(id) || {};
      const as = activityMap.get(id) || {};
      const followingCount = Array.isArray(account.following) ? account.following.length : 0;
      const botProbability = Math.max(
        0,
        Math.min(
          1,
          Number(account.botScore ?? account.behaviorFeatures?.botScore ?? 0)
        )
      );

      return {
        profile: {
          id,
          username: account.username,
          bio: account.bio || "",
          followersCount: Number(account.followersCount || 0),
          followingCount,
          createdAt: account.createdAt || null,
          lastBehaviorComputedAt: account.lastBehaviorComputedAt || null,
        },
        engagement: {
          postsCount: Number(ps.postsCount || 0),
          likesReceived: Number(ps.likesReceived || 0),
          commentsReceived: Number(ps.commentsReceived || 0),
          likesGiven: Number(as.likesGiven || 0),
          commentsMade: Number(as.commentsMade || 0),
          followsGiven: Number(as.followsGiven || 0),
          totalEvents: Number(as.totalEvents || 0),
          lastActiveAt: as.lastActiveAt || null,
        },
        bot: {
          probability: Number(botProbability.toFixed(4)),
          behaviorFeatures: account.behaviorFeatures || {},
        },
      };
    });

    return res.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error("Admin list accounts error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.delete("/api/admin/accounts/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const account = await Account.findById(id).lean();
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (String(account.username || "").toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
      return res.status(403).json({ error: "Cannot delete admin account" });
    }

    const usernameRegex = new RegExp(`^${escapeRegex(String(account.username || ""))}$`, "i");

    await Post.deleteMany({ artistId: account._id });
    await Post.updateMany(
      {},
      {
        $pull: {
          likedBy: { $in: [String(account.username || "").toLowerCase(), String(account.username || "")] },
          comments: { user: usernameRegex },
        },
      }
    );

    await ActivityLog.deleteMany({
      $or: [{ userId: account._id }, { username: usernameRegex }],
    });

    await Account.updateMany(
      { following: account._id },
      { $pull: { following: account._id } }
    );

    await Account.deleteOne({ _id: account._id });

    // Recompute followersCount after relationship cleanup.
    await Account.updateMany({}, { $set: { followersCount: 0 } });
    const followerAgg = await Account.aggregate([
      { $unwind: "$following" },
      { $group: { _id: "$following", count: { $sum: 1 } } },
    ]);
    if (followerAgg.length) {
      await Account.bulkWrite(
        followerAgg.map((r) => ({
          updateOne: {
            filter: { _id: r._id },
            update: { $set: { followersCount: r.count } },
          },
        }))
      );
    }

    return res.json({ ok: true, deletedAccountId: id, username: account.username });
  } catch (err) {
    console.error("Admin delete account error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/behavior/recompute", async (req, res) => {
  try {
    const limit = Math.min(Number(req.body?.limit) || 200, 5000);
    const result = await runBehaviorAnalysisBatch(limit);
    res.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  } catch (err) {
    console.error("Behavior recompute error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// START SERVER
// =============================

app.listen(PORT, () =>
  console.log(`🚀 Backend running on http://localhost:${PORT}`)
);

if ((process.env.BEHAVIOR_ANALYSIS_ENABLED || "true").toLowerCase() !== "false") {
  const intervalMs = Math.max(
    Number(process.env.BEHAVIOR_ANALYSIS_INTERVAL_MS) || 15 * 60 * 1000,
    60 * 1000
  );
  setInterval(() => {
    runBehaviorAnalysisBatch().catch((err) =>
      console.warn("Behavior batch error:", err.message || err)
    );
  }, intervalMs);
}

