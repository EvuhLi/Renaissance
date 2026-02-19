const mongoose = require("mongoose");

const communityRequestSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    username: { type: String, default: "" },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const communitySchema = new mongoose.Schema(
  {
    ownerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    ownerUsername: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, index: true },
    visibility: { type: String, enum: ["public", "private"], default: "public" },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Account" }],
    pendingRequests: { type: [communityRequestSchema], default: [] },
  },
  { timestamps: true }
);

communitySchema.index({ ownerAccountId: 1, normalizedName: 1 }, { unique: true });

module.exports = mongoose.model("Community", communitySchema);
