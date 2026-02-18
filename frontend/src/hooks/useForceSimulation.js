import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

const TAG_SIMILARITY_THRESHOLD = 0.4;
const MIN_NODE_SIZE = 80;
const MAX_NODE_SIZE = 200;
const CANVAS_PADDING = 200;

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

// Build graph nodes and links from posts
const buildGraph = (posts) => {
  const nodes = posts.map((post, i) => {
    // Initialize positions randomly, D3 will update these
    const angle = (i / posts.length) * Math.PI * 2;
    const radius = 200;
    return {
      id: String(post._id || post.id),
      index: i,
      score: post.score || 50,
      post,
      x: 0 + Math.cos(angle) * radius,
      y: 0 + Math.sin(angle) * radius,
    };
  });

  const links = [];
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const similarity = calculateTagSimilarity(
        posts[i].mlTags,
        posts[j].mlTags
      );
      if (similarity > TAG_SIMILARITY_THRESHOLD) {
        links.push({
          source: i,
          target: j,
          strength: similarity,
        });
      }
    }
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
      setNodes([]);
      return;
    }

    const { nodes: graphNodes, links } = buildGraph(posts);
    
    // Calculate max score for radial force
    const maxScore = Math.max(...graphNodes.map((n) => n.score), 100);

    // Create force simulation
    const simulation = d3
      .forceSimulation(graphNodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d, i) => i)  // Use index as ID
          .distance(100)
          .strength(0.3)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force(
        "center",
        d3.forceCenter(width / 2, height / 2).strength(0.1)
      )
      .force(
        "radial",
        d3
          .forceRadial((d) => {
            // Posts with higher scores attract toward center
            const normalized = d.score / maxScore;
            return (1 - normalized) * 200;
          })
          .strength(0.2)
      )
      .on("tick", () => {
        // Clamp positions to prevent nodes from flying off
        graphNodes.forEach((d) => {
          d.x = Math.max(MIN_NODE_SIZE, Math.min(width - MIN_NODE_SIZE, d.x));
          d.y = Math.max(MIN_NODE_SIZE, Math.min(height - MIN_NODE_SIZE, d.y));
        });
        
        // Enrich nodes with sizes and update state
        const enrichedNodes = graphNodes.map((d) => {
          const normalizedScore = d.score / maxScore;
          const size = MIN_NODE_SIZE + (MAX_NODE_SIZE - MIN_NODE_SIZE) * normalizedScore;
          return {
            ...d,
            size,
            radius: size / 2,
          };
        });
        
        setNodes(enrichedNodes);
        onPositionsUpdate?.(enrichedNodes);
      })
      .stop();

    // Warm up simulation to distribute nodes better before rendering
    for (let i = 0; i < 300; i++) {
      simulation.tick();
    }
    
    // Trigger initial state update after warmup
    const enrichedNodes = graphNodes.map((d) => {
      const normalizedScore = d.score / maxScore;
      const size = MIN_NODE_SIZE + (MAX_NODE_SIZE - MIN_NODE_SIZE) * normalizedScore;
      return {
        ...d,
        size,
        radius: size / 2,
      };
    });
    setNodes(enrichedNodes);

    simulationRef.current = simulation;

    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [posts, width, height, onPositionsUpdate]);

  return {
    nodes,
    simulation: simulationRef.current,
  };
};

export default useForceSimulation;
