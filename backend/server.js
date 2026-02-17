require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodeFetch = require("node-fetch");
const FormData = require("form-data");

const Post = require("./models/Post");
const Account = require("./models/Account");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// =============================
// ENV
// =============================

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8001";

// =============================
// DATABASE
// =============================

if (!MONGODB_URI) {
  console.error("❌ Missing MONGODB_URI in .env");
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

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
// FYP RECOMMENDATIONS
// =============================

app.get("/api/fyp", async (req, res) => {
  try {
    const { username } = req.query;
    const limit = parseInt(req.query.limit) || 20;

    // Filter: 1. Not the user's own post. 2. User is not in the likedBy array.
    let query = {};
    if (username && username !== "undefined" && username !== "null") {
      query = {
        user: { $ne: username },        // Don't show my own posts
        likedBy: { $ne: username }     // Don't show posts I've already liked
      };
    }

    const posts = await Post.find(query)
      .sort({ date: -1 })
      .lean();

    if (!posts.length) return res.json([]);

    const serializedPosts = posts.map((p) => ({
      ...p,
      _id: p._id.toString(),
      artistId: p.artistId?.toString(),
      mlTags: p.mlTags || {},
    }));

    // Send the filtered list to the ML service for ranking
    const pyResponse = await nodeFetch(`${ML_SERVICE_URL}/recommendation/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        posts: serializedPosts,
        user_id: username || null,
        top_n: limit,
      }),
    });

    if (!pyResponse.ok) {
      console.warn("⚠️ Recommendation service failed. Using fallback.");
      return res.json(serializedPosts.slice(0, limit));
    }

    const recommended = await pyResponse.json();
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

    // Update ML Service interaction history
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
    } = req.body;

    if (!user || !url)
      return res.status(400).json({ error: "user and url required" });

    let resolvedArtistId = artistId;

    if (!resolvedArtistId) {
      const account = await Account.findOneAndUpdate(
        { username: user },
        { $setOnInsert: { username: user } },
        { new: true, upsert: true }
      );
      resolvedArtistId = account._id;
    }

    const newPost = await Post.create({
      artistId: resolvedArtistId,
      user,
      url,
      title: title?.trim() || "",
      description: description?.trim() || "",
      tags: Array.isArray(tags) ? tags : [],
      mlTags: mlTags || {},
      medium,
      likedBy: [] // Initialize empty list
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
    const { username } = req.body; // Frontend must send this

    const updatedPost = await Post.findByIdAndUpdate(
      id,
      { 
        $inc: { likes: 1 },
        $addToSet: { likedBy: username } // Prevents duplicates automatically
      },
      { new: true }
    );

    if (!updatedPost)
      return res.status(404).json({ error: "Post not found" });

    res.json(updatedPost);
  } catch (err) {
    console.error("Like Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// =============================
// ACCOUNTS
// =============================

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
// START SERVER
// =============================

app.listen(PORT, () =>
  console.log(`🚀 Backend running on http://localhost:${PORT}`)
);