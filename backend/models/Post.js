const mongoose = require('mongoose');


// Post Schema
const postSchema = new mongoose.Schema({
  artistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
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
