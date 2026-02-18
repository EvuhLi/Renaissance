const Account = require("../models/Account");
const Post = require("../models/Post");
const ActivityLog = require("../models/ActivityLog");

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((acc, x) => acc + (x - m) ** 2, 0) / arr.length);
}

function entropyNormalized(hist) {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let h = 0;
  for (const c of hist) {
    if (!c) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h / Math.log2(hist.length);
}

async function computeBehaviorFeaturesForAccount(account) {
  const posts = await Post.find({ artistId: account._id }, "date postType originalPostTimestamp").lean();
  const logs = await ActivityLog.find({ userId: account._id }, "eventType timestamp latencyMs").lean();

  const allTimestamps = [
    ...posts.map((p) => p.date).filter(Boolean),
    ...logs.map((l) => l.timestamp).filter(Boolean),
  ]
    .map((d) => new Date(d))
    .sort((a, b) => a - b);

  const intervalsSec = [];
  for (let i = 1; i < allTimestamps.length; i++) {
    intervalsSec.push((allTimestamps[i] - allTimestamps[i - 1]) / 1000);
  }

  const intervalMean = mean(intervalsSec);
  const intervalStd = std(intervalsSec);
  const intervalRegularity = intervalMean > 0 ? clamp01(1 - intervalStd / (intervalMean + 1e-6)) : 0;

  const hourly = Array.from({ length: 24 }, () => 0);
  allTimestamps.forEach((d) => {
    hourly[d.getUTCHours()] += 1;
  });
  const circadianFlatness = entropyNormalized(hourly);

  let maxGapHours = 0;
  for (let i = 1; i < allTimestamps.length; i++) {
    const gap = (allTimestamps[i] - allTimestamps[i - 1]) / (1000 * 60 * 60);
    if (gap > maxGapHours) maxGapHours = gap;
  }

  const replyLatencies = [];
  posts.forEach((p) => {
    if (p.postType === "reply" && p.originalPostTimestamp && p.date) {
      replyLatencies.push((new Date(p.date) - new Date(p.originalPostTimestamp)) / 1000);
    }
  });
  logs.forEach((l) => {
    if (l.eventType === "comment_create" && typeof l.latencyMs === "number") {
      replyLatencies.push(l.latencyMs / 1000);
    }
  });

  const fastReplyPct =
    replyLatencies.length > 0
      ? replyLatencies.filter((v) => v >= 0 && v < 10).length / replyLatencies.length
      : 0;

  const botScore = clamp01(
    0.4 * circadianFlatness +
      0.3 * intervalRegularity +
      0.3 * fastReplyPct
  );

  return {
    eventCount: allTimestamps.length,
    intervalMeanSec: Number(intervalMean.toFixed(2)),
    intervalStdSec: Number(intervalStd.toFixed(2)),
    intervalRegularity: Number(intervalRegularity.toFixed(4)),
    circadianFlatness: Number(circadianFlatness.toFixed(4)),
    maxInactivityGapHours: Number(maxGapHours.toFixed(2)),
    replyCount: replyLatencies.length,
    fastReplyPct: Number(fastReplyPct.toFixed(4)),
    botScore: Number(botScore.toFixed(4)),
  };
}

async function runBehaviorAnalysisBatch(limit = 200) {
  const accounts = await Account.find({}, "_id username").limit(limit).lean();
  let processed = 0;
  for (const account of accounts) {
    const features = await computeBehaviorFeaturesForAccount(account);
    await Account.findByIdAndUpdate(account._id, {
      botScore: features.botScore,
      behaviorFeatures: features,
      lastBehaviorComputedAt: new Date(),
    });
    processed += 1;
  }
  return { processed };
}

module.exports = {
  computeBehaviorFeaturesForAccount,
  runBehaviorAnalysisBatch,
};

