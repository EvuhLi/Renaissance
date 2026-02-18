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

function toId(v) {
  if (!v) return "";
  return String(v);
}

function louvainLocalMove(nodeIds, adjacency) {
  const degrees = {};
  let m2 = 0; // 2m
  for (const id of nodeIds) {
    const neighbors = adjacency.get(id) || new Map();
    let d = 0;
    neighbors.forEach((w) => {
      d += w;
    });
    degrees[id] = d;
    m2 += d;
  }
  if (!m2) {
    return new Map(nodeIds.map((id) => [id, id]));
  }

  const communityOf = new Map(nodeIds.map((id) => [id, id]));
  const sumTot = new Map(nodeIds.map((id) => [id, degrees[id]]));

  let improved = true;
  let iterations = 0;
  while (improved && iterations < 25) {
    improved = false;
    iterations += 1;

    const shuffled = [...nodeIds].sort(() => Math.random() - 0.5);
    for (const nodeId of shuffled) {
      const nodeDegree = degrees[nodeId] || 0;
      const nodeNeighbors = adjacency.get(nodeId) || new Map();
      const currentCommunity = communityOf.get(nodeId);

      const neighborCommWeights = new Map();
      nodeNeighbors.forEach((w, neighborId) => {
        const c = communityOf.get(neighborId);
        neighborCommWeights.set(c, (neighborCommWeights.get(c) || 0) + w);
      });

      sumTot.set(currentCommunity, (sumTot.get(currentCommunity) || 0) - nodeDegree);

      let bestCommunity = currentCommunity;
      let bestGain = 0;

      for (const [candidateCommunity, kiIn] of neighborCommWeights.entries()) {
        const candidateTot = sumTot.get(candidateCommunity) || 0;
        const gain = kiIn - (candidateTot * nodeDegree) / m2;
        if (gain > bestGain) {
          bestGain = gain;
          bestCommunity = candidateCommunity;
        }
      }

      communityOf.set(nodeId, bestCommunity);
      sumTot.set(bestCommunity, (sumTot.get(bestCommunity) || 0) + nodeDegree);

      if (bestCommunity !== currentCommunity) improved = true;
    }
  }

  return communityOf;
}

async function computeNetworkSignals(accounts) {
  const accountIds = accounts.map((a) => toId(a._id)).filter(Boolean);
  const accountIdSet = new Set(accountIds);
  const adjacency = new Map(accountIds.map((id) => [id, new Map()]));

  // Build undirected follow graph for cluster analysis.
  for (const account of accounts) {
    const src = toId(account._id);
    const follows = Array.isArray(account.following) ? account.following : [];
    for (const targetRaw of follows) {
      const dst = toId(targetRaw);
      if (!dst || !accountIdSet.has(dst) || src === dst) continue;
      adjacency.get(src).set(dst, 1);
      adjacency.get(dst).set(src, 1);
    }
  }

  const communityOf = louvainLocalMove(accountIds, adjacency);
  const communityMembers = new Map();
  for (const id of accountIds) {
    const cid = communityOf.get(id);
    if (!communityMembers.has(cid)) communityMembers.set(cid, []);
    communityMembers.get(cid).push(id);
  }

  const communityDensity = new Map();
  for (const [cid, members] of communityMembers.entries()) {
    const n = members.length;
    if (n < 2) {
      communityDensity.set(cid, 0);
      continue;
    }
    const memberSet = new Set(members);
    let internalEdges = 0;
    for (const a of members) {
      const neighbors = adjacency.get(a) || new Map();
      neighbors.forEach((_, b) => {
        if (memberSet.has(b) && a < b) internalEdges += 1;
      });
    }
    const possible = (n * (n - 1)) / 2;
    communityDensity.set(cid, possible > 0 ? internalEdges / possible : 0);
  }

  // Engagement aggregates per account.
  const objectIds = accounts.map((a) => a._id);
  const postAgg = await Post.aggregate([
    { $match: { artistId: { $in: objectIds } } },
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
  const postMap = new Map(postAgg.map((r) => [toId(r._id), r]));
  const followsById = new Map(
    accounts.map((a) => [
      toId(a._id),
      new Set((Array.isArray(a.following) ? a.following : []).map(toId)),
    ])
  );

  const networkSignals = new Map();

  for (const account of accounts) {
    const id = toId(account._id);
    const cid = communityOf.get(id);
    const members = communityMembers.get(cid) || [];
    const density = communityDensity.get(cid) || 0;

    const following = Array.isArray(account.following) ? account.following.map(toId) : [];
    const followingCount = following.length;
    const followersCount = Number(account.followersCount || 0);

    // Reciprocal follows can indicate follow-farm behavior when very high.
    const reciprocalCount = following.filter((targetId) => {
      const targetFollows = followsById.get(targetId);
      if (!targetFollows) return false;
      return targetFollows.has(id);
    }).length;
    const reciprocalFollowRate = followingCount > 0 ? reciprocalCount / followingCount : 0;

    const p = postMap.get(id) || {};
    const postsCount = Number(p.postsCount || 0);
    const likesReceived = Number(p.likesReceived || 0);
    const commentsReceived = Number(p.commentsReceived || 0);
    const engagementReceived = likesReceived + commentsReceived * 2;
    const engagementPerPost = engagementReceived / (postsCount + 1);

    const followingSkew = clamp01((followingCount / (followersCount + 1)) / 8);
    const lowEngagement = clamp01(1 - engagementPerPost / 5);
    const tightCluster = clamp01(density);
    const mutualClusterSignal = clamp01(reciprocalFollowRate);

    const networkBotSignal = clamp01(
      0.42 * followingSkew +
      0.28 * lowEngagement +
      0.20 * tightCluster +
      0.10 * mutualClusterSignal
    );

    networkSignals.set(id, {
      communityId: String(cid),
      communitySize: members.length,
      communityDensity: Number(density.toFixed(4)),
      reciprocalFollowRate: Number(reciprocalFollowRate.toFixed(4)),
      followingCount,
      followersCount,
      postsCount,
      likesReceived,
      commentsReceived,
      engagementPerPost: Number(engagementPerPost.toFixed(4)),
      followingSkew: Number(followingSkew.toFixed(4)),
      lowEngagement: Number(lowEngagement.toFixed(4)),
      networkBotSignal: Number(networkBotSignal.toFixed(4)),
    });
  }

  return networkSignals;
}

async function computeBehaviorFeaturesForAccount(account, networkSignal = null) {
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

  const behavioralBotScore = clamp01(
    0.4 * circadianFlatness +
      0.3 * intervalRegularity +
      0.3 * fastReplyPct
  );

  const networkBotSignal = clamp01(Number(networkSignal?.networkBotSignal || 0));
  const botScore = clamp01(0.72 * behavioralBotScore + 0.28 * networkBotSignal);

  return {
    eventCount: allTimestamps.length,
    intervalMeanSec: Number(intervalMean.toFixed(2)),
    intervalStdSec: Number(intervalStd.toFixed(2)),
    intervalRegularity: Number(intervalRegularity.toFixed(4)),
    circadianFlatness: Number(circadianFlatness.toFixed(4)),
    maxInactivityGapHours: Number(maxGapHours.toFixed(2)),
    replyCount: replyLatencies.length,
    fastReplyPct: Number(fastReplyPct.toFixed(4)),
    behavioralBotScore: Number(behavioralBotScore.toFixed(4)),
    network: networkSignal || {},
    botScore: Number(botScore.toFixed(4)),
  };
}

async function runBehaviorAnalysisBatch(limit = 200) {
  const accounts = await Account.find({}, "_id username following followersCount")
    .limit(limit)
    .lean();
  const networkSignals = await computeNetworkSignals(accounts);
  let processed = 0;
  for (const account of accounts) {
    const features = await computeBehaviorFeaturesForAccount(
      account,
      networkSignals.get(toId(account._id)) || null
    );
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
  computeNetworkSignals,
  runBehaviorAnalysisBatch,
};
