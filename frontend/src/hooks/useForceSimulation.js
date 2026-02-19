import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

const TAG_SIMILARITY_THRESHOLD = 0.2;
const MIN_NODE_SIZE = 100;
const MAX_NODE_SIZE = 190;
const NODE_GAP = 10; // Large gap to ensure they stay spread out

// 1. HELPER: Calculate tag similarity between two posts
const calculateTagSimilarity = (tagsA, tagsB) => {
  if (!tagsA || !tagsB) return 0;

  const extractLabels = (tags) => {
    if (!tags || typeof tags !== "object") return new Set();
    const labels = new Set();
    Object.values(tags).forEach((tagList) => {
      if (Array.isArray(tagList)) {
        tagList.forEach((tag) => {
          if (tag && tag.label) labels.add(tag.label);
        });
      }
    });
    return labels;
  };

  const labelsA = extractLabels(tagsA);
  const labelsB = extractLabels(tagsB);

  if (labelsA.size === 0 || labelsB.size === 0) return 0;

  const intersection = new Set([...labelsA].filter((x) => labelsB.has(x)));
  const union = new Set([...labelsA, ...labelsB]);

  return intersection.size / union.size;
};

// 2. HELPER: Extract all labels for similarity comparison
const extractAllLabels = (post) => {
  const labels = new Set();
  const ml = post?.mlTags;
  if (ml && typeof ml === "object") {
    Object.values(ml).forEach((tagList) => {
      if (Array.isArray(tagList)) {
        tagList.forEach((tag) => {
          const label = String(tag?.label || "").trim().toLowerCase();
          if (label) labels.add(label);
        });
      }
    });
  }
  if (Array.isArray(post?.tags)) {
    post.tags.forEach((tag) => {
      const label = String(tag || "").trim().toLowerCase();
      if (label) labels.add(label);
    });
  }
  return labels;
};

// 3. HELPER: Label similarity helper
const labelSimilarity = (labelsA, labelsB) => {
  if (!labelsA.size || !labelsB.size) return 0;
  const intersection = new Set([...labelsA].filter((x) => labelsB.has(x)));
  const union = new Set([...labelsA, ...labelsB]);
  return union.size ? intersection.size / union.size : 0;
};

// 4. GRAPH BUILDER: Prepares nodes and links
const buildGraph = (posts) => {
  const nodes = posts.map((post, i) => {
    const scoreRaw =
      typeof post?.score === "number"
        ? post.score
        : typeof post?.likes === "number"
        ? post.likes
        : 1;
    const score = Math.max(1, scoreRaw);

    // Initial placement in a spiral to help D3 push them out better
    const angle = i * 0.5;
    const radius = 100 * Math.sqrt(i);
    return {
      id: String(post._id || post.id),
      index: i,
      score,
      labels: extractAllLabels(post),
      post,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  const links = [];
  for (let i = 0; i < posts.length; i++) {
    const candidates = [];
    for (let j = i + 1; j < posts.length; j++) {
      const mlSimilarity = calculateTagSimilarity(posts[i].mlTags, posts[j].mlTags);
      const labelSim = labelSimilarity(nodes[i].labels, nodes[j].labels);
      const similarity = Math.max(mlSimilarity, labelSim);
      if (similarity >= TAG_SIMILARITY_THRESHOLD) {
        candidates.push({
          source: i,
          target: j,
          strength: similarity,
        });
      }
    }

    candidates
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3) // Max 3 links per node to keep it clean
      .forEach((link) => {
        links.push(link);
      });
  }

  return { nodes, links };
};

// 5. THE MAIN HOOK
export const useForceSimulation = (
  posts,
  width = 1200,
  height = 800,
  onPositionsUpdate
) => {
  const [nodes, setNodes] = useState([]);
  const simulationRef = useRef(null);

  useEffect(() => {
    if (!posts || posts.length === 0) {
      if (simulationRef.current) simulationRef.current.stop();
      setNodes([]);
      return;
    }

    const { nodes: graphNodes, links } = buildGraph(posts);
    const maxScore = Math.max(...graphNodes.map((n) => n.score), 1);
    const centerX = width / 2;
    const centerY = height / 2;

    const visualSizeFor = (d) => {
      const normalizedScore = d.score / maxScore;
      return MIN_NODE_SIZE + (MAX_NODE_SIZE - MIN_NODE_SIZE) * normalizedScore;
    };

    // Create force simulation
    const simulation = d3
      .forceSimulation(graphNodes)
      // Extreme repulsion (-4000) to keep images spread out
      .force("charge", d3.forceManyBody().strength(0))
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d, i) => i)
          .distance(10) // Longer links for more space
          .strength(0.1)
      )
      .force("center", d3.forceCenter(centerX, centerY).strength(0.05))
      // Stiff collision barrier to prevent any overlapping
      .force(
        "collide",
        d3.forceCollide().radius((d) => (visualSizeFor(d) / 2) + NODE_GAP).iterations(4)
      )
      .on("tick", () => {
        const enriched = graphNodes.map((d) => ({
          ...d,
          size: visualSizeFor(d),
          radius: visualSizeFor(d) / 2,
        }));
        setNodes(enriched);
        onPositionsUpdate?.(enriched);
      });

    // Run 200 ticks instantly so it appears already spread out
    for (let i = 0; i < 200; i++) simulation.tick();

    simulationRef.current = simulation;

    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [posts, width, height, onPositionsUpdate]);

  return { nodes };
};

export default useForceSimulation;