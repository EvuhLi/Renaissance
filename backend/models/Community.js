const mongoose = require("mongoose");

const communityRequestSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["follow", "link"], required: true },
    requesterAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const communitySchema = new mongoose.Schema(
  {
    ownerAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    ownerUsername: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    visibility: { type: String, enum: ["public", "private"], default: "public" },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Account" }],
    pendingRequests: { type: [communityRequestSchema], default: [] },
  },
  { timestamps: true }
);

communitySchema.index({ ownerAccountId: 1, name: 1 });
communitySchema.index({ followers: 1 });
communitySchema.index({ ownerUsername: 1 });

module.exports = mongoose.model("Community", communitySchema);

