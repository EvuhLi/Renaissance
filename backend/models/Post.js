const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema(
  {
    user: { type: String, required: true },
    text: { type: String, required: true },
  },
  { _id: false }
);

const PostSchema = new mongoose.Schema({
  user: { type: String, required: true },
  likes: { type: Number, default: 0 },
  comments: { type: [CommentSchema], default: [] },
  url: { type: String, required: true },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Post', PostSchema);
