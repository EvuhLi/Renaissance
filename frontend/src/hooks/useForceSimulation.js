import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

const TAG_SIMILARITY_THRESHOLD = 0.2;
const MIN_NODE_SIZE = 100;
const MAX_NODE_SIZE = 190;
const NODE_GAP = 36;

// Calculate tag similarity between two posts
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

const labelSimilarity = (labelsA, labelsB) => {
  if (!labelsA.size || !labelsB.size) return 0;
  const intersection = new Set([...labelsA].filter((x) => labelsB.has(x)));
  const union = new Set([...labelsA, ...labelsB]);
  return union.size ? intersection.size / union.size : 0;
};

// Build graph nodes and links from posts
const buildGraph = (posts) => {
  const nodes = posts.map((post, i) => {
    const scoreRaw =
      typeof post?.score === "number"
        ? post.score
        : typeof post?.likes === "number"
        ? post.likes
        : 1;
    const score = Math.max(1, scoreRaw);

    // Initialize positions randomly, D3 will update these
    const angle = (i / posts.length) * Math.PI * 2;
    const radius = 220 + Math.random() * 220;
    return {
      id: String(post._id || post.id),
      index: i,
      score,
      labels: extractAllLabels(post),
      post,
      x: 0 + Math.cos(angle) * radius,
      y: 0 + Math.sin(angle) * radius,
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
      .slice(0, 4)
      .forEach((link) => {
        links.push({
          ...link,
        });
      });
  }

  return { nodes, links };
};

/**
 * Custom hook for force-directed graph simulation
 * Returns nodes with computed {x, y, vx, vy} positions and size
 */
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
      window.requestAnimationFrame(() => setNodes([]));
      return;
    }

    const { nodes: graphNodes, links } = buildGraph(posts);
    
    // Calculate max score for radial force
    const maxScore = Math.max(...graphNodes.map((n) => n.score), 1);
    const centerX = width / 2;
    const centerY = height / 2;
    const maxCenterDistance = Math.max(1, Math.hypot(centerX, centerY));
    const visualSizeFor = (d) => {
      const normalizedScore = d.score / maxScore;
      const baseSize =
        MIN_NODE_SIZE + (MAX_NODE_SIZE - MIN_NODE_SIZE) * normalizedScore;
      const distanceToCenter = Math.hypot(d.x - centerX, d.y - centerY);
      const centerCloseness = Math.max(
        0,
        1 - distanceToCenter / maxCenterDistance
      );
      const centerBoost = 1 + centerCloseness * 0.45;
      return baseSize * centerBoost;
    };
    const resolveOverlap = () => {
      // Additional overlap pass on top of d3 collide.
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < graphNodes.length; i++) {
          for (let j = i + 1; j < graphNodes.length; j++) {
            const a = graphNodes[i];
            const b = graphNodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dist = Math.hypot(dx, dy);
            if (!dist) {
              dx = Math.random() - 0.5;
              dy = Math.random() - 0.5;
              dist = Math.hypot(dx, dy) || 1;
            }
            const minDist = (visualSizeFor(a) + visualSizeFor(b)) * 0.5 + NODE_GAP;
            if (dist < minDist) {
              const push = (minDist - dist) * 0.5;
              const ux = dx / dist;
              const uy = dy / dist;
              a.x -= ux * push;
              a.y -= uy * push;
              b.x += ux * push;
              b.y += uy * push;
            }
          }
        }
      }
    };
    const enrichNodes = () => {
      // Clamp positions to prevent nodes from flying off
      graphNodes.forEach((d) => {
        d.x = Math.max(MIN_NODE_SIZE, Math.min(width - MIN_NODE_SIZE, d.x));
        d.y = Math.max(MIN_NODE_SIZE, Math.min(height - MIN_NODE_SIZE, d.y));
      });

      // Recenter graph so it starts centered instead of drifting right/left.
      const centroid = graphNodes.reduce(
        (acc, d) => {
          acc.x += d.x;
          acc.y += d.y;
          return acc;
        },
        { x: 0, y: 0 }
      );
      centroid.x /= graphNodes.length;
      centroid.y /= graphNodes.length;
      const shiftX = centerX - centroid.x;
      const shiftY = centerY - centroid.y;

      graphNodes.forEach((d) => {
        d.x = Math.max(
          MIN_NODE_SIZE,
          Math.min(width - MIN_NODE_SIZE, d.x + shiftX)
        );
        d.y = Math.max(
          MIN_NODE_SIZE,
          Math.min(height - MIN_NODE_SIZE, d.y + shiftY)
        );
      });

      resolveOverlap();

      // Make center nodes larger.
      return graphNodes.map((d) => {
        const size = visualSizeFor(d);
        return {
          ...d,
          size,
          radius: size / 2,
        };
      });
    };

    // Create force simulation
    const simulation = d3
      .forceSimulation(graphNodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d, i) => i)  // Use index as ID
          .distance((d) => 275 - d.strength * 90)
          .strength((d) => 0.14 + d.strength * 0.4)
      )
      .force("charge", d3.forceManyBody().strength(-880))
      .force(
        "center",
        d3.forceCenter(centerX, centerY).strength(0.16)
      )
      .force(
        "radial",
        d3
          .forceRadial((d) => {
            // Posts with higher scores attract toward center
            const normalized = d.score / maxScore;
            return (1 - normalized) * Math.min(width, height) * 0.58;
          })
          .strength(0.2)
      )
      .force(
        "collide",
        d3.forceCollide((d) => {
          const normalizedScore = d.score / maxScore;
          const base = MIN_NODE_SIZE + (MAX_NODE_SIZE - MIN_NODE_SIZE) * normalizedScore;
          return base * 1.05;
        })
      )
      .on("tick", () => {
        const enrichedNodes = enrichNodes();
        setNodes(enrichedNodes);
        onPositionsUpdate?.(enrichedNodes);
      })
      .stop();

    // Warm up simulation to distribute nodes better before rendering
    for (let i = 0; i < 260; i++) {
      simulation.tick();
    }

    const warmed = enrichNodes();
    window.requestAnimationFrame(() => {
      setNodes(warmed);
      onPositionsUpdate?.(warmed);
    });
    
    simulationRef.current = simulation;

    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [posts, width, height, onPositionsUpdate]);

  return {
    nodes,
  };
};

export default useForceSimulation;
