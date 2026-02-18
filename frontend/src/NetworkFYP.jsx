import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useForceSimulation } from "./hooks/useForceSimulation";
import NetworkCanvas from "./components/NetworkCanvas";
import PostModal from "./components/PostModal";

const BACKEND_URL = "http://localhost:3001";
const BATCH_SIZE = 12;

const NetworkFYP = ({ username }) => {
  const [posts, setPosts] = useState([]);
  const [allPosts, setAllPosts] = useState([]); // All posts ever loaded
  const [likedPosts, setLikedPosts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [selectedPost, setSelectedPost] = useState(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // Update canvas size on window resize
  useEffect(() => {
    const handleResize = () => {
      setCanvasSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Force simulation hook - use actual canvas size
  const { nodes, simulation } = useForceSimulation(posts, canvasSize.width, canvasSize.height);

  // Build links from posts for canvas rendering
  const buildLinks = useCallback(() => {
    if (!nodes.length) return [];
    
    const TAG_SIMILARITY_THRESHOLD = 0.4;
    
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

    const links = [];
    for (let i = 0; i < posts.length; i++) {
      for (let j = i + 1; j < posts.length; j++) {
        const similarity = calculateTagSimilarity(posts[i].mlTags, posts[j].mlTags);
        if (similarity > TAG_SIMILARITY_THRESHOLD) {
          links.push({
            source: nodes[i],
            target: nodes[j],
            strength: similarity,
          });
        }
      }
    }
    return links;
  }, [posts, nodes]);

  const links = buildLinks();

  // Fetch initial batch of posts
  const fetchPostsBatch = useCallback(async (limit = BATCH_SIZE) => {
    setLoading(true);
    setError("");
    try {
      const activeUser = username || localStorage.getItem("username");
      const params = new URLSearchParams({ limit });
      if (activeUser && activeUser !== "null" && activeUser !== "undefined") {
        params.set("username", activeUser);
      }

      const res = await fetch(`${BACKEND_URL}/api/fyp?${params}`);
      if (!res.ok) throw new Error(`FYP fetch failed: ${res.status}`);

      const data = await res.json();
      setAllPosts(data);
      setPosts(data.slice(0, BATCH_SIZE));
      
      // Mark liked posts
      const liked = {};
      data.forEach((post) => {
        const postId = String(post._id || post.id);
        if (post.likedBy && activeUser) {
          liked[postId] = post.likedBy.includes(activeUser);
        }
      });
      setLikedPosts(liked);
    } catch (err) {
      console.error("FYP fetch error:", err);
      setError("Couldn't load your feed right now.");
    } finally {
      setLoading(false);
    }
  }, [username]);

  // Initial fetch
  useEffect(() => {
    fetchPostsBatch();
  }, [fetchPostsBatch]);

  useEffect(() => {
    console.log("NetworkFYP state:", {
      postsLoaded: posts.length,
      nodesGenerated: nodes.length,
      allPostsCount: allPosts.length,
      loading,
      error,
    });
  }, [posts, nodes, allPosts, loading, error]);

  // Detect when user pans to edge and load more posts
  const checkBoundsAndLoadMore = useCallback(() => {
    if (posts.length >= allPosts.length) return;
    if (nodes.length === 0) return;

    const minX = Math.min(...nodes.map((n) => n.x), Infinity);
    const maxX = Math.max(...nodes.map((n) => n.x), -Infinity);
    const minY = Math.min(...nodes.map((n) => n.y), Infinity);
    const maxY = Math.max(...nodes.map((n) => n.y), -Infinity);

    // If user has panned to show most of the network, load more posts
    const boundWidth = maxX - minX;
    const boundHeight = maxY - minY;
    
    if (boundWidth > canvasSize.width * 0.4 || boundHeight > canvasSize.height * 0.4) {
      if (posts.length < allPosts.length) {
        const newPosts = allPosts.slice(0, Math.min(posts.length + BATCH_SIZE, allPosts.length));
        setPosts(newPosts);
      }
    }
  }, [posts, nodes, allPosts, canvasSize]);

  useEffect(() => {
    checkBoundsAndLoadMore();
  }, [scale, pan, checkBoundsAndLoadMore]);

  // Handle pan/zoom updates
  const handlePanZoom = ({ pan: newPan, scale: newScale }) => {
    setPan(newPan);
    setScale(newScale);
  };

  // Handle node click - open modal
  const handleNodeClick = (node) => {
    setSelectedPost(node.post);
  };

  // Record interaction with backend
  const recordInteraction = useCallback(
    async (postId, type) => {
      const activeUser = username || localStorage.getItem("username");
      if (!activeUser) return;
      try {
        await fetch(`${BACKEND_URL}/api/interaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: activeUser, postId, type }),
        });
      } catch (err) {
        console.warn("Interaction record failed:", err.message);
      }
    },
    [username]
  );

  // Handle like
  const handleLike = useCallback(async () => {
    if (!selectedPost) return;

    const rawUser = username || localStorage.getItem("username");
    let activeUser;
    if (!rawUser) {
      navigate("/login");
      return;
    }
    activeUser = rawUser;

    const postId = String(selectedPost._id || selectedPost.id);
    const wasLiked = likedPosts[postId];
    const delta = wasLiked ? -1 : 1;

    // Optimistic update
    setLikedPosts((prev) => ({ ...prev, [postId]: !wasLiked }));
    setSelectedPost((prev) => ({
      ...prev,
      likes: Math.max(0, (prev.likes ?? 0) + delta),
    }));

    try {
      const res = await fetch(`${BACKEND_URL}/api/posts/${postId}/like`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: activeUser }),
      });

      if (!res.ok) throw new Error(`Like request failed: ${res.status}`);

      const updatedPost = await res.json();
      const norm = {
        ...updatedPost,
        _id: String(updatedPost._id),
        artistId: updatedPost.artistId
          ? String(updatedPost.artistId)
          : updatedPost.artistId,
        likes:
          typeof updatedPost.likes === "number"
            ? updatedPost.likes
            : Number(updatedPost.likes) || 0,
        mlTags: updatedPost.mlTags || {},
      };

      setSelectedPost(norm);
      setPosts((prev) =>
        prev.map((p) => (String(p._id || p.id) === postId ? norm : p))
      );

      const isNowLiked = norm.likedBy
        ?.map((u) => u.toLowerCase())
        .includes(activeUser?.toLowerCase());
      setLikedPosts((prev) => ({ ...prev, [postId]: Boolean(isNowLiked) }));

      if (!wasLiked) recordInteraction(postId, "like");
    } catch (err) {
      console.error("Like failed:", err);
      // Rollback
      setLikedPosts((prev) => ({ ...prev, [postId]: wasLiked }));
      setSelectedPost((prev) => ({
        ...prev,
        likes: Math.max(0, (prev.likes ?? 0) - delta),
      }));
    }
  }, [selectedPost, likedPosts, username, navigate, recordInteraction]);

  if (loading && posts.length === 0) {
    return (
      <div style={styles.centerScreen}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Curating your network…</p>
      </div>
    );
  }

  if (error && posts.length === 0) {
    return (
      <div style={styles.centerScreen}>
        <p style={styles.errorText}>{error}</p>
        <button style={styles.retryBtn} onClick={() => fetchPostsBatch()}>
          Try again
        </button>
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div style={styles.centerScreen}>
        <p style={styles.emptyText}>No posts loaded — check back later!</p>
      </div>
    );
  }

  const postId = selectedPost ? String(selectedPost._id || selectedPost.id) : null;
  const isSelectedLiked = postId ? likedPosts[postId] : false;

  return (
    <div ref={containerRef} style={styles.container}>
      <NetworkCanvas
        nodes={nodes}
        links={links}
        width={canvasSize.width}
        height={canvasSize.height}
        onNodeClick={handleNodeClick}
        selectedNodeId={postId}
        scale={scale}
        pan={pan}
        onPanZoom={handlePanZoom}
      />

      {selectedPost && (
        <PostModal
          post={selectedPost}
          username={username}
          onClose={() => setSelectedPost(null)}
          onLike={handleLike}
          isLiked={isSelectedLiked}
        />
      )}

      {/* Status indicators */}
      <div style={styles.statusBar}>
        <div style={styles.statusText}>
          Nodes: {nodes.length} | Posts: {posts.length} / {allPosts.length}
        </div>
        <div style={styles.statusText}>
          Zoom: {(scale * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    width: "100vw",
    height: "100vh",
    backgroundColor: "#000",
    position: "relative",
    overflow: "hidden",
  },
  centerScreen: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    gap: "16px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid rgba(255,255,255,0.15)",
    borderTop: "3px solid #a78bfa",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: "14px",
    margin: 0,
  },
  errorText: {
    color: "#f87171",
    fontSize: "15px",
    margin: 0,
  },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: "15px",
    margin: 0,
  },
  retryBtn: {
    background: "#a78bfa",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "10px 24px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  statusBar: {
    position: "fixed",
    bottom: "16px",
    left: "16px",
    display: "flex",
    gap: "24px",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(167, 139, 250, 0.2)",
    borderRadius: "8px",
    padding: "12px 16px",
    fontSize: "12px",
    color: "rgba(255, 255, 255, 0.6)",
  },
  statusText: {
    margin: 0,
  },
};

// Inject keyframes
if (typeof document !== "undefined") {
  const styleTag = document.createElement("style");
  styleTag.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  if (!document.head.querySelector("style[data-spin-animation]")) {
    styleTag.setAttribute("data-spin-animation", "true");
    document.head.appendChild(styleTag);
  }
}

export default NetworkFYP;
