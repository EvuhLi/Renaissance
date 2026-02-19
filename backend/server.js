require("dotenv").config();

const express = require("express");
const cors = require("cors");
const compression = require("compression");
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
app.use(compression({ level: 6, threshold: 1024 })); // Gzip responses > 1KB
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve frontend static files
const path = require("path");
app.use(express.static(path.join(__dirname, "../frontend/dist")));

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

async function ensureIndexes() {
  try {
    // Create compound indexes for fast filtering + sorting
    await Post.collection.createIndex({ artistId: 1, date: -1 });
    await Post.collection.createIndex({ user: 1, date: -1 });
    await Post.collection.createIndex({ date: -1 });
    
    // Create **case-insensitive** index for username lookups
    // This allows fast username queries regardless of case
    const userCollation = { locale: "en", strength: 2 };
    await Post.collection.dropIndex("user_1_date_-1").catch(() => {}); // Remove old index if exists
    await Post.collection.createIndex(
      { user: 1, date: -1 },
      { collation: userCollation, name: "user_ci_date" }
    );
    
    console.log("✓ Database indexes created (including case-insensitive user index)");
  } catch (e) {
    console.warn("Index creation warning:", e.message);
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
    await ensureIndexes();
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
      timeout: 30000,
    });

    if (!mlResponse.ok) {
      const err = await mlResponse.text();
      console.error("ML analyze error:", err);
      // Graceful fallback: keep post flow working even if tagging service is down.
      return res.json({});
    }

    const result = await mlResponse.json();
    res.json(result && typeof result === "object" ? result : {});
  } catch (err) {
    console.error("Analyze crash:", err.message);
    // Graceful fallback instead of surfacing 500 to frontend.
    res.json({});
  }
});

// =============================
// GET ACCOUNT BY ID
// =============================

app.get("/api/accounts/id/:id", async (req, res) => {
  const t0 = Date.now();
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const account = await Account.findById(id);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    console.log(`[Accounts/ID] ${id}: ${Date.now() - t0}ms`);
    res.json(account);
  } catch (err) {
    console.error("Get Account By ID Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// FYP RECOMMENDATIONS
// =============================

// Fast FYP endpoint - returns posts with images (gzipped)
app.get("/api/fyp", async (req, res) => {
  const t0 = Date.now();
  try {
    const limit = Math.min(parseInt(req.query.limit) || 12, 30); // Reduced default to 12
    const page = Math.max(parseInt(req.query.page) || 0, 0);
    const skip = page * limit;

    // Fetch posts WITHOUT images initially - much faster
    const t_query = Date.now();
    const posts = await Post.find(
      {},
      "_id artistId user postCategory postType title description tags medium likes likedBy date mlTags url"
    )
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .maxTimeMS(5000)
      .lean();
    console.log(`[FYP] Query time: ${Date.now() - t_query}ms, posts: ${posts.length}`);

    if (!posts.length) return res.json([]);

    // Serialize posts WITHOUT images - frontend will fetch them on-demand
    const serializedPosts = posts.map((p) => ({
      _id: p._id.toString(),
      artistId: p.artistId?.toString(),
      user: p.user,
      postCategory: p.postCategory || "artwork",
      postType: p.postType || "original",
      title: p.title,
      description: p.description,
      tags: p.tags || [],
      medium: p.medium,
      url: p.url || "",
      mlTags: p.mlTags || {}, // Include ML tags for network visualization
      likes: p.likes || 0,
      likedBy: p.likedBy || [],
      date: p.date,
    }));

    console.log(`[FYP] Total time: ${Date.now() - t0}ms`);
    res.set("Cache-Control", "public, max-age=15");
    return res.json(serializedPosts);
  } catch (err) {
    console.error("FYP Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Endpoint to fetch image for a specific post
app.get("/api/posts/:id/image", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }
    
    const post = await Post.findById(id)
      .select("_id url")
      .lean()
      .maxTimeMS(2000);
    
    if (!post || !post.url) {
      return res.status(404).json({ error: "Post not found" });
    }
    
    // Return just the image URL - gzip compression handles the rest
    res.set("Cache-Control", "public, max-age=604800"); // 7 day cache
    res.json({
      _id: post._id.toString(),
      url: post.url,
    });
  } catch (err) {
    console.error("Image fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch image" });
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
  const t0 = Date.now();
  try {
    const { artistId, username, skip, limit } = req.query;
    const skipVal = Math.max(0, parseInt(skip) || 0);
    const limitVal = Math.min(parseInt(limit) || 36, 120);
    
    let query = {};
    // Fast path: exact artistId lookup uses index and avoids regex/$or.
    if (artistId && mongoose.Types.ObjectId.isValid(String(artistId))) {
      query = { artistId: new mongoose.Types.ObjectId(String(artistId)) };
    } else if (username) {
      // Use normalized lowercase string matching (index-friendly, not regex)
      query = { user: String(username).trim().toLowerCase() };
    }

    const t_query = Date.now();
    const queryBuilder = Post.find(query)
      .select("_id artistId user previewUrl title description tags medium postCategory postType likes likedBy date");
    
    // Use case-insensitive collation if querying by username
    if (query.user) {
      queryBuilder.collation({ locale: "en", strength: 2 });
    }
    const posts = await queryBuilder
      .sort({ date: -1 })
      .skip(skipVal)
      .limit(limitVal)
      .maxTimeMS(8000)
      .lean();
    console.log(`[Posts] Find query: ${Date.now() - t_query}ms`);
      
    const normalized = posts.map((p) => ({
      _id: String(p._id),
      artistId: p.artistId ? String(p.artistId) : p.artistId,
      user: p.user,
      url: p.previewUrl || "",
      title: p.title,
      description: p.description,
      tags: p.tags || [],
      medium: p.medium,
      postCategory: p.postCategory || "artwork",
      postType: p.postType || "original",
      likes: p.likes || 0,
      likedBy: p.likedBy || [],
      date: p.date,
      // STRIPPED: processSlides, comments, mlTags to reduce payload size
      // Use /api/posts/:id/full endpoint if full data needed
    }));
    
    console.log(`[Posts] Total time: ${Date.now() - t0}ms, posts: ${posts.length}`);
    // Return array directly (ProfilePage expects this format)
    res.json(normalized);
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
      processSlides,
      previewUrl,
      postCategory,
      title,
      description,
      tags,
      mlTags,
      medium,
      postType,
      inReplyToPostId,
    } = req.body;
    // NORMALIZE: Store usernames in lowercase for consistent index-based queries
    const normalizedUser = String(user || "").trim().toLowerCase();
    const resolvedCategory = ["artwork", "process", "sketch"].includes(postCategory)
      ? postCategory
      : "artwork";
    const normalizedSlides = Array.isArray(processSlides)
      ? processSlides.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
      : [];
    const coverUrl = (typeof url === "string" && url.trim()) ? url.trim() : normalizedSlides[0] || "";
    const coverPreviewUrl =
      typeof previewUrl === "string" && previewUrl.trim()
        ? previewUrl.trim()
        : coverUrl;

    if (!normalizedUser || !coverUrl)
      return res.status(400).json({ error: "user and image(s) required" });

    let resolvedArtistId = artistId;
    const resolvedPostType = ["original", "reply", "repost"].includes(postType)
      ? postType
      : "original";
    let resolvedInReplyToPostId = null;
    let parentPostTimestamp = null;

    if (!resolvedArtistId) {
      const account = await Account.findOneAndUpdate(
        { username: normalizedUser },
        { $setOnInsert: { username: normalizedUser } },
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
      user: normalizedUser,
      postCategory: resolvedCategory,
      postType: resolvedPostType,
      inReplyToPostId: resolvedInReplyToPostId,
      originalPostTimestamp: parentPostTimestamp,
      url: coverUrl,
      previewUrl: coverPreviewUrl,
      processSlides: normalizedSlides,
      title: title?.trim() || "",
      description: description?.trim() || "",
      tags: Array.isArray(tags) ? tags : [],
      mlTags:
        resolvedCategory === "artwork"
          ? (mlTags || {})
          : (mlTags && typeof mlTags === "object" ? mlTags : {}),
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
      username: normalizedUser,
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
        postCategory: resolvedCategory,
        slideCount: normalizedSlides.length,
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
// GET FULL POST DETAILS (with processSlides + comments)
// =============================
// Lazy-loaded endpoint for full post details (process slides, all comments)
// Called on-demand when user interacts with a post in detail view
app.get("/api/posts/:id/full", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }
    
    const post = await Post.findById(id).lean();
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    
    // Return full post with all details
    res.json({
      ...post,
      _id: post._id.toString(),
      artistId: post.artistId?.toString(),
      // processSlides and comments included here (only fetched on-demand)
    });
  } catch (err) {
    console.error("Get Full Post Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// GET POST COMMENTS (PAGINATED)
// =============================
// Fast endpoint to fetch paginated comments for a post
app.get("/api/posts/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const page = Math.max(0, Number(req.query.page) || 0);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
    const skip = page * limit;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    // Use aggregation to fetch only the comments slice we need
    const result = await Post.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      { $project: { comments: 1 } },
      {
        $facet: {
          metadata: [
            { $project: { count: { $size: { $ifNull: ["$comments", []] } } } }
          ],
          comments: [
            { $unwind: "$comments" },
            { $replaceRoot: { newRoot: "$comments" } },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }
          ]
        }
      }
    ]);

    const totalCount = result[0]?.metadata[0]?.count || 0;
    const comments = result[0]?.comments || [];

    res.json({
      comments,
      total: totalCount,
      page,
      limit,
      hasMore: skip + limit < totalCount
    });
  } catch (err) {
    console.error("Get Comments Error:", err);
    res.status(500).json({ error: "Failed to fetch comments" });
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

    // 1. Check if the ID is a valid MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    // 2. Find and delete the post
    const deletedPost = await Post.findByIdAndDelete(id);

    if (!deletedPost) {
      return res.status(404).json({ error: "Post not found" });
    }

  

    res.status(200).json({ message: "Post deleted successfully", id });
  } catch (err) {
    console.error("Delete Post Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
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

    const comment = {
      user: username,
      text: String(text),
      createdAt: new Date(),
    };

    // Add comment and return the full updated post
    const updated = await Post.findByIdAndUpdate(
      id,
      { $push: { comments: comment } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Return the full post as plain JSON so frontend gets all fields
    res.json(updated.toObject ? updated.toObject() : updated);

    // Non-blocking operations happen after response
    // Do these in background without waiting
    (async () => {
      try {
        // Get post once for tracking (lightweight)
        const post = await Post.findById(id, "date").lean();
        
        // Fire ML interaction in background (don't wait for it)
        nodeFetch(`${ML_SERVICE_URL}/recommendation/interaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: String(username).toLowerCase(),
            post_id: String(id),
            interaction_type: "comment",
          }),
        }).catch(err => console.warn("ML tracking failed:", err.message));

        // Log activity in background
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
        }).catch(err => console.warn("Activity logging failed:", err.message));
      } catch (bgErr) {
        console.warn("Background operation error:", bgErr.message);
      }
    })();
  } catch (err) {
    console.error("Add Comment Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// =============================
// ACCOUNTS
// =============================

app.get("/api/accounts/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    const query = q ? { username: new RegExp(escapeRegex(q), "i") } : {};

    const results = await Account.find(query)
      .select("_id username bio followersCount profilePic")
      .sort({ username: 1 })
      .limit(limit)
      .lean();

    res.json(results);
  } catch (err) {
    console.error("Account Search Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

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

app.patch("/api/accounts/:id/bio", async (req, res) => {
  try {
    const { id } = req.params;
    const { bio } = req.body;

    // Check if the ID is valid
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid target account ID" });
    }

    // Update the user's bio in the database
    const updated = await Account.findByIdAndUpdate(
      id,
      { bio: bio },
      { new: true } // Returns the updated document
    );

    if (!updated) return res.status(404).json({ error: "Account not found" });
    
    // Send the updated user back to the frontend
    res.json(updated);
  } catch (err) {
    console.error("Bio Update Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/accounts/:username", async (req, res) => {
  const t0 = Date.now();
  try {
    const { username } = req.params;

    let account = await Account.findOne({ username });
    if (!account) account = await Account.create({ username });

    console.log(`[Accounts] ${username}: ${Date.now() - t0}ms`);
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

// SPA fallback: serve index.html for any non-API routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

app.listen(PORT, () =>
  console.log(`🚀 Backend running on http://localhost:${PORT}`)
);

// Public search users endpoint
app.get("/api/search/users", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const query = { role: { $ne: "admin" } }; // Exclude admins
    if (search) {
      query.username = new RegExp(escapeRegex(search), "i");
    }

    const users = await Account.find(query, "_id username bio followersCount createdAt")
      .sort({ username: 1 })
      .limit(limit)
      .lean();

    res.json(users);
  } catch (err) {
    console.error("User search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

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
