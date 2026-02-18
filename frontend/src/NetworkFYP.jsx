import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForceSimulation } from "./hooks/useForceSimulation";
import { useArtProtection } from "./hooks/useArtProtection";
import NetworkCanvas from "./components/NetworkCanvas";
import PostModal from "./components/PostModal";

const BACKEND_URL = "http://localhost:3001";
const INITIAL_VISIBLE_NODES = 28;
const FETCH_LIMIT = 80;
const LOAD_MORE_STEP = 16;
const CATEGORY_THRESHOLDS = {
  medium: 0.2,
  subject: 0.2,
  style: 0.2,
  mood: 0.2,
  color_palette: 0.2,
  aesthetic_features: 0.2,
};
const LINK_COLORS = {
  medium: "#6B705C",
  subject: "#CB997E",
  style: "#A5A58D",
  mood: "#B08968",
  color_palette: "#7F5539",
  aesthetic_features: "#84A98C",
  follower: "#B56576",
};

const NetworkFYP = ({ username }) => {
  const { isProtected } = useArtProtection();
  const [posts, setPosts] = useState([]);
  const [allPosts, setAllPosts] = useState([]); // All posts ever loaded
  const [searchQuery, setSearchQuery] = useState("");
  const [likedPosts, setLikedPosts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followingSet, setFollowingSet] = useState(new Set());
  const [linkFilters, setLinkFilters] = useState({
    medium: true,
    subject: true,
    style: true,
    mood: true,
    color_palette: true,
    aesthetic_features: true,
    follower: true,
  });
  
  const [selectedPost, setSelectedPost] = useState(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const activeUser = username || localStorage.getItem("username") || "";
  const accountId = localStorage.getItem("accountId") || "";
  const profilePath = accountId ? `/profile/${encodeURIComponent(accountId)}` : "/profile";

  useEffect(() => {
    const loadFollowing = async () => {
      if (!accountId) {
        setFollowingSet(new Set());
        return;
      }
      try {
        const res = await fetch(`${BACKEND_URL}/api/accounts/id/${encodeURIComponent(accountId)}`);
        if (!res.ok) return;
        const account = await res.json();
        const ids = new Set((account?.following || []).map((id) => String(id)));
        setFollowingSet(ids);
      } catch (e) {
        console.warn("Failed to load following set:", e);
      }
    };
    loadFollowing();
  }, [accountId]);

  // Keep canvas in sync with actual container dimensions.
  useEffect(() => {
    const updateFromContainer = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      });
    };

    updateFromContainer();
    const observer = new ResizeObserver(updateFromContainer);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener("resize", updateFromContainer);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFromContainer);
    };
  }, []);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((post) => {
      const user = String(post.user || "").toLowerCase();
      const title = String(post.title || "").toLowerCase();
      const description = String(post.description || "").toLowerCase();
      const tags = Array.isArray(post.tags)
        ? post.tags.map((t) => String(t || "").toLowerCase()).join(" ")
        : "";
      const mlTags = post?.mlTags && typeof post.mlTags === "object"
        ? Object.values(post.mlTags)
            .flat()
            .map((t) => String(t?.label || "").toLowerCase())
            .join(" ")
        : "";
      return (
        user.includes(q) ||
        title.includes(q) ||
        description.includes(q) ||
        tags.includes(q) ||
        mlTags.includes(q)
      );
    });
  }, [posts, searchQuery]);

  // Force simulation hook - use actual canvas size
  const { nodes } = useForceSimulation(filteredPosts, canvasSize.width, canvasSize.height);

  const links = useMemo(() => {
    if (!nodes.length) return [];

    const similarity = (labelsA, labelsB) => {
      if (!labelsA.size || !labelsB.size) return 0;
      const intersection = new Set([...labelsA].filter((x) => labelsB.has(x)));
      const union = new Set([...labelsA, ...labelsB]);
      return union.size ? intersection.size / union.size : 0;
    };

    const labelsFor = (post, category) => {
      const labels = new Set();
      if (category === "medium") {
        const mediumLabel = String(post?.medium || "").trim().toLowerCase();
        if (mediumLabel) labels.add(mediumLabel);
      }
      if (post?.mlTags && Array.isArray(post.mlTags[category])) {
        post.mlTags[category].forEach((tag) => {
          const label = String(tag?.label || "").trim().toLowerCase();
          if (label) labels.add(label);
        });
      }
      return labels;
    };

    const perCategoryLabels = {};
    Object.keys(CATEGORY_THRESHOLDS).forEach((category) => {
      perCategoryLabels[category] = nodes.map((n) => labelsFor(n.post, category));
    });

    const built = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        Object.entries(CATEGORY_THRESHOLDS).forEach(([category, threshold]) => {
          const score = similarity(
            perCategoryLabels[category][i],
            perCategoryLabels[category][j]
          );
          if (score >= threshold) {
            built.push({
              source: nodes[i],
              target: nodes[j],
              strength: score,
              type: category,
            });
          }
        });

        const aArtistId = String(nodes[i]?.post?.artistId || "");
        const bArtistId = String(nodes[j]?.post?.artistId || "");
        if (
          aArtistId &&
          bArtistId &&
          aArtistId !== bArtistId &&
          followingSet.has(aArtistId) &&
          followingSet.has(bArtistId)
        ) {
          built.push({
            source: nodes[i],
            target: nodes[j],
            strength: 1,
            type: "follower",
          });
        }
      }
    }

    return built;
  }, [nodes, followingSet]);

  const visibleLinks = useMemo(
    () => links.filter((l) => linkFilters[l.type] !== false),
    [links, linkFilters]
  );

  // Fetch initial batch of posts
  const fetchPostsBatch = useCallback(async (limit = FETCH_LIMIT) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit });
      if (activeUser && activeUser !== "null" && activeUser !== "undefined") {
        params.set("username", activeUser);
      }

      const res = await fetch(`${BACKEND_URL}/api/fyp?${params}`);
      if (!res.ok) throw new Error(`FYP fetch failed: ${res.status}`);

      const data = await res.json();
      setAllPosts(data);
      setPosts(data.slice(0, INITIAL_VISIBLE_NODES));
      
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
  }, [activeUser]);

  // Initial fetch
  useEffect(() => {
    fetchPostsBatch();
  }, [fetchPostsBatch]);

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
        const newPosts = allPosts.slice(
          0,
          Math.min(posts.length + LOAD_MORE_STEP, allPosts.length)
        );
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

  const handleComment = useCallback(
    async (text) => {
      if (!selectedPost) return false;
      if (!activeUser) {
        navigate("/login");
        return false;
      }

      const postId = String(selectedPost._id || selectedPost.id);
      try {
        const response = await fetch(`${BACKEND_URL}/api/posts/${postId}/comment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: activeUser, text }),
        });
        if (!response.ok) throw new Error(`Comment request failed: ${response.status}`);

        const updatedPost = await response.json();
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
          comments: Array.isArray(updatedPost.comments) ? updatedPost.comments : [],
        };

        setSelectedPost(norm);
        setPosts((prev) =>
          prev.map((p) => (String(p._id || p.id) === postId ? norm : p))
        );
        return true;
      } catch (err) {
        console.error("Comment failed:", err);
        return false;
      }
    },
    [selectedPost, activeUser, navigate]
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
    <div ref={containerRef} style={styles.container} onContextMenu={(e) => e.preventDefault()}>
      <div style={styles.topNav}>
        <Link to="/" style={styles.navLink}>Home</Link>
        <Link to="/about" style={styles.navLink}>About</Link>
        <Link to="/search" style={styles.navLink}>Search</Link>
        {accountId ? (
          <>
            <Link to={profilePath} style={styles.navLink}>Profile</Link>
            <button
              style={styles.navBtn}
              onClick={() => {
                localStorage.removeItem("accountId");
                localStorage.removeItem("username");
                window.dispatchEvent(new Event("accountIdChanged"));
                navigate("/login");
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <Link to="/login" style={styles.navLink}>Login</Link>
        )}
      </div>

      <div style={styles.searchBar}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search posts, tags, or artists..."
          style={styles.searchInput}
        />
        <button style={styles.searchBtn} onClick={() => navigate("/search")}>
          Search
        </button>
      </div>

      <div style={{ ...styles.canvasWrap, filter: isProtected ? "blur(24px)" : "none" }}>
        <NetworkCanvas
          nodes={nodes}
          links={visibleLinks}
          linkColors={LINK_COLORS}
          width={canvasSize.width}
          height={canvasSize.height}
          onNodeClick={handleNodeClick}
          selectedNodeId={postId}
          scale={scale}
          pan={pan}
          onPanZoom={handlePanZoom}
        />
      </div>

      {selectedPost && (
        <PostModal
          post={selectedPost}
          username={activeUser}
          onClose={() => setSelectedPost(null)}
          onLike={handleLike}
          onComment={handleComment}
          isLiked={isSelectedLiked}
          isProtected={isProtected}
        />
      )}

      {isProtected && <div style={styles.protectionOverlay}>Protected View Active</div>}

      {/* Status indicators */}
      <div style={styles.statusBar}>
        <div style={styles.statusText}>
          Nodes: {nodes.length} | Visible: {filteredPosts.length} | Posts: {posts.length} / {allPosts.length}
        </div>
        <div style={styles.statusText}>
          Zoom: {(scale * 100).toFixed(0)}%
        </div>
      </div>

      <div style={styles.legendPanel}>
        <p style={styles.legendTitle}>Connection Key</p>
        {Object.entries(LINK_COLORS).map(([type, color]) => (
          <label key={type} style={styles.legendRow}>
            <input
              type="checkbox"
              checked={!!linkFilters[type]}
              onChange={(e) =>
                setLinkFilters((prev) => ({ ...prev, [type]: e.target.checked }))
              }
            />
            <span style={{ ...styles.legendSwatch, backgroundColor: color }} />
            <span style={styles.legendLabel}>{type.replace("_", " ")}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

const styles = {
  container: {
    position: "fixed",
    inset: 0,
    width: "100vw",
    height: "100vh",
    backgroundColor: "#E8E4D9",
    backgroundImage:
      "linear-gradient(#D3CDC1 1px, transparent 1px), linear-gradient(90deg, #D3CDC1 1px, transparent 1px)",
    backgroundSize: "40px 40px",
    overflow: "hidden",
  },
  centerScreen: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8E4D9",
    backgroundImage:
      "linear-gradient(#D3CDC1 1px, transparent 1px), linear-gradient(90deg, #D3CDC1 1px, transparent 1px)",
    backgroundSize: "40px 40px",
    gap: "16px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid rgba(74,74,74,0.2)",
    borderTop: "3px solid #A5A58D",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    color: "#6B705C",
    fontSize: "14px",
    margin: 0,
  },
  errorText: {
    color: "#f87171",
    fontSize: "15px",
    margin: 0,
  },
  emptyText: {
    color: "#6B705C",
    fontSize: "15px",
    margin: 0,
  },
  retryBtn: {
    background: "#A5A58D",
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
    backgroundColor: "rgba(253, 251, 247, 0.88)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(165, 165, 141, 0.45)",
    borderRadius: "8px",
    padding: "12px 16px",
    fontSize: "12px",
    color: "#6B705C",
  },
  searchBar: {
    position: "fixed",
    top: "64px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 20,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px",
    borderRadius: "12px",
    backgroundColor: "rgba(253, 251, 247, 0.92)",
    border: "1px solid rgba(165, 165, 141, 0.45)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
  },
  topNav: {
    position: "fixed",
    top: "12px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 21,
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    borderRadius: "12px",
    backgroundColor: "rgba(253, 251, 247, 0.92)",
    border: "1px solid rgba(165, 165, 141, 0.45)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
  },
  navLink: {
    textDecoration: "none",
    color: "#4A4A4A",
    fontSize: "13px",
    fontWeight: 700,
    padding: "6px 10px",
    borderRadius: "8px",
    background: "rgba(232, 228, 217, 0.65)",
    border: "1px solid rgba(165, 165, 141, 0.4)",
  },
  navBtn: {
    color: "#4A4A4A",
    fontSize: "13px",
    fontWeight: 700,
    padding: "6px 10px",
    borderRadius: "8px",
    background: "rgba(232, 228, 217, 0.65)",
    border: "1px solid rgba(165, 165, 141, 0.4)",
    cursor: "pointer",
  },
  searchInput: {
    width: "min(460px, 62vw)",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid rgba(165, 165, 141, 0.55)",
    backgroundColor: "#fff",
    color: "#4A4A4A",
    fontSize: "14px",
    outline: "none",
  },
  searchBtn: {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "none",
    background: "#A5A58D",
    color: "#fff",
    fontWeight: "600",
    cursor: "pointer",
  },
  statusText: {
    margin: 0,
  },
  canvasWrap: {
    position: "absolute",
    inset: 0,
  },
  protectionOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#4A4A4A",
    backgroundColor: "rgba(253, 251, 247, 0.24)",
    backdropFilter: "blur(8px)",
    pointerEvents: "none",
    fontSize: "13px",
    fontWeight: 700,
  },
  legendPanel: {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: 20,
    minWidth: "190px",
    padding: "10px 12px",
    borderRadius: "12px",
    backgroundColor: "rgba(253, 251, 247, 0.92)",
    border: "1px solid rgba(165, 165, 141, 0.45)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
  },
  legendTitle: {
    margin: "0 0 8px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#4A4A4A",
  },
  legendRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "6px",
    fontSize: "12px",
    color: "#4A4A4A",
  },
  legendSwatch: {
    width: "18px",
    height: "3px",
    borderRadius: "2px",
    display: "inline-block",
  },
  legendLabel: {
    textTransform: "capitalize",
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
