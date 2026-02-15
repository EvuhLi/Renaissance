const mongoose = require('mongoose');


const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  profilePic: { type: String, default: "/assets/default-avatar.png" },
  bio: { type: String, default: "Weaving my digital legacy." },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of user IDs
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // We don't store the actual posts here; we query them from the Post collection
});

// Post Schema
const postSchema = new mongoose.Schema({
  user: { type: String, required: true },
  url: { type: String, required: true },
  likes: { type: Number, default: 0 },
  description: String,
  title: String,
  tags: [String],
  medium: String,
  comments: [{
    user: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
  }]
});



module.exports = mongoose.model('Post', postSchema);
