require("dotenv").config({ path: "backend/.env" });
const mongoose = require("mongoose");
const sharp = require("sharp");
const Post = require("../models/Post");

const MONGODB_URI = process.env.MONGODB_URI;
const BATCH_SIZE = Math.max(1, Number(process.env.PREVIEW_BACKFILL_BATCH || 50));
const MAX_SIDE = Math.max(320, Number(process.env.PREVIEW_MAX_SIDE || 720));
const JPEG_QUALITY = Math.min(95, Math.max(40, Number(process.env.PREVIEW_QUALITY || 68)));

function parseDataUrl(value = "") {
  const match = String(value).match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

async function buildPreviewFromDataUrl(dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const inputBuffer = Buffer.from(parsed.base64, "base64");
  const outputBuffer = await sharp(inputBuffer)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${outputBuffer.toString("base64")}`;
}

async function run() {
  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI");
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  console.log("Connected");

  const query = {
    $or: [{ previewUrl: { $exists: false } }, { previewUrl: "" }, { previewUrl: null }],
  };

  const total = await Post.countDocuments(query);
  console.log(`Posts needing preview backfill: ${total}`);

  let processed = 0;
  let updated = 0;
  let failed = 0;

  while (true) {
    const batch = await Post.find(query, "_id url previewUrl")
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (!batch.length) break;

    const ops = [];
    for (const post of batch) {
      processed += 1;
      try {
        const url = String(post.url || "").trim();
        if (!url) continue;

        let previewUrl = "";
        if (url.startsWith("data:image/")) {
          previewUrl = await buildPreviewFromDataUrl(url);
        } else {
          previewUrl = url;
        }
        if (!previewUrl) continue;

        ops.push({
          updateOne: {
            filter: { _id: post._id },
            update: { $set: { previewUrl } },
          },
        });
      } catch (err) {
        failed += 1;
        console.warn(`Failed preview for post ${post._id}: ${err.message}`);
      }
    }

    if (ops.length) {
      const result = await Post.bulkWrite(ops, { ordered: false });
      updated += result.modifiedCount || 0;
    }

    console.log(`Progress: processed=${processed}, updated=${updated}, failed=${failed}`);
  }

  console.log(`Done. processed=${processed}, updated=${updated}, failed=${failed}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Backfill failed:", err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});

