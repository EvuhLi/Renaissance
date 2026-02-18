const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  artistId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  user:        { type: String, required: true },
  postType:    { type: String, enum: ["original", "reply", "repost"], default: "original" },
  inReplyToPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
  originalPostTimestamp: { type: Date, default: null },
  url:         { type: String, required: true },
  likes:       { type: Number, default: 0 },
  likedBy: {
    type: [String], // Array of usernames
    default: [],
    index: true     // Adding an index makes the "Hide Liked" query much faster
  },
  description: String,
  title:       String,
  tags:        [String],
  medium:      String,
  comments: [{
    user:      String,
    text:      String,
    createdAt: { type: Date, default: Date.now }
  }],
  // Structured ML tag object from tagging.py — used by the recommendation algorithm.
  // Stored as Mixed so the nested { label, confidence } structure is preserved as-is.
  mlTags: {
    type:    mongoose.Schema.Types.Mixed,
    default: {},
  },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Post', postSchema);
