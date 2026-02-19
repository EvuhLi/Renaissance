import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useArtProtection } from "./hooks/useArtProtection";

const BACKEND_URL = "http://localhost:3001";
// If true, liking requires an authenticated username and will redirect to /login
const REQUIRE_LOGIN_FOR_LIKES = true;

// ─── Serendipity badge ───────────────────────────────────────────────────────
const SerendipityBadge = () => (
  <div style={styles.serendipityBadge}>
    <span style={styles.serendipityIcon}>✦</span> Discovered for you
  </div>
);
// ─── Single full-screen post card ────────────────────────────────────────────
const FYPCard = ({ post, username, onLike, likedPosts, isProtected }) => {
  const navigate = useNavigate();
  const postId = String(post._id || post.id);
  const isLiked = !!likedPosts[postId];

  const handleArtistClick = (e) => {
    e.stopPropagation();
    if (post.artistId) navigate(`/profile/${post.artistId}`);
  };

  return (
    <div style={styles.card}>
      {/* Artwork */}
      <img
        src={post.url || ""}
        alt={post.title || "Artwork"}
        style={{
          ...styles.cardImage,
          filter: isProtected ? "blur(26px)" : "none",
        }}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
      />
      
      {/* Gradient overlay */}
      <div style={styles.overlay} />

      {/* Top badges */}
      <div style={styles.topRow}>
        {post.is_serendipity && <SerendipityBadge />}
      </div>

      {/* Bottom info */}
      <div style={styles.bottomRow}>
        <div style={styles.postMeta}>
          {post.title && <p style={styles.postTitle}>{post.title}</p>}
          {post.description && (
            <p style={styles.postDescription}>{post.description}</p>
          )}
          <button style={styles.artistBtn} onClick={handleArtistClick}>
            <span style={styles.artistAt}>@</span>
            {post.user}
          </button>
        </div>

        {/* Like button */}
        <div style={styles.actions}>
          <button
            style={{
              ...styles.likeBtn,
              ...(isLiked ? styles.likeBtnActive : {}),
            }}
            onClick={() => onLike(postId, isLiked)}
            aria-label={isLiked ? "Unlike" : "Like"}
          >
            <span style={styles.likeHeart}>{isLiked ? "♥" : "♡"}</span>
            <span style={styles.likeCount}>{post.likes ?? 0}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main FYP component ──────────────────────────────────────────────────────
const FYP = ({ username }) => {
  const { isProtected } = useArtProtection();
  const [posts, setPosts] = useState([]);
  // Lazy image loading removed
  const [likedPosts, setLikedPosts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);

  const containerRef = useRef(null);
  const isScrolling = useRef(false);
  const navigate = useNavigate();

  // ── Fetch FYP feed ─────────────────────────────────────────────────────────
  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Use prop or fallback to localStorage to ensure identity is sent
      const activeUser = username || localStorage.getItem("username");
      
      const params = new URLSearchParams({ limit: 12, page: 0 }); // Request 12 posts initially
      if (activeUser && activeUser !== "null" && activeUser !== "undefined") {
        params.set("username", activeUser);
      }

      const res = await fetch(`${BACKEND_URL}/api/fyp?${params}`);
      if (!res.ok) throw new Error(`FYP fetch failed: ${res.status}`);

      const data = await res.json();
      // Eager-load image URLs for all posts
      const postsWithImages = await Promise.all(
        (Array.isArray(data) ? data : []).map(async (p) => {
          const postId = String(p._id || p.id || "");
          if (!postId) return p;
          try {
            const imgRes = await fetch(`${BACKEND_URL}/api/posts/${postId}/image`);
            if (!imgRes.ok) return p;
            const imgData = await imgRes.json();
            return { ...p, url: imgData?.url || p.url };
          } catch (e) {
            return p;
          }
        })
      );
      setPosts(postsWithImages);
      setCurrentIdx(0);
          } catch {
      console.error("FYP fetch error:", err);
      setError("Couldn't load your feed right now.");
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Lazy loading removed

  // ── Notify backend of a like so ML service can learn ───────────────────────
  const recordInteraction = useCallback(async (postId, type) => {
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
  }, [username]);

  // ── Like handler ───────────────────────────────────────────────────────────
  const handleLike = useCallback(async (postId, wasLiked) => {
    const rawUser = username || localStorage.getItem("username");
    let activeUser;
    if (!rawUser) {
      if (REQUIRE_LOGIN_FOR_LIKES) {
        navigate("/login");
        return;
      }
      activeUser = "Loom_Artist_01";
    } else {
      activeUser = rawUser;
    }
    const delta = wasLiked ? -1 : 1;

    // Optimistic update
    setLikedPosts(prev => ({ ...prev, [postId]: !wasLiked }));
    setPosts(prev =>
      prev.map(p =>
        String(p._id || p.id) === postId
          ? { ...p, likes: Math.max(0, (p.likes ?? 0) + delta) }
          : p
      )
    );

    try {
      const res = await fetch(`${BACKEND_URL}/api/posts/${postId}/like`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: activeUser }),
      });

      if (!res.ok) throw new Error(`Like request failed: ${res.status}`);

      const updatedPost = await res.json();

      // Normalize server response
      const norm = {
        ...updatedPost,
        _id: String(updatedPost._id),
        artistId: updatedPost.artistId ? String(updatedPost.artistId) : updatedPost.artistId,
        likes: typeof updatedPost.likes === "number" ? updatedPost.likes : Number(updatedPost.likes) || 0,
        mlTags: updatedPost.mlTags || {},
      };

      // Replace local post with server version to avoid drift
      // But preserve the loaded image URL if it exists
      setPosts(prev => prev.map(p => {
        if (String(p._id || p.id) === postId) {
          const currentUrl = p.url; // Preserve current URL
          return { ...norm, url: currentUrl || norm.url };
        }
        return p;
      }));

      // Update likedPosts based on server likedBy
      const isNowLiked = norm.likedBy?.map(u => u.toLowerCase()).includes(activeUser?.toLowerCase());
      setLikedPosts(prev => ({ ...prev, [postId]: Boolean(isNowLiked) }));

      if (!wasLiked) recordInteraction(postId, "like");
    } catch (err) {
      console.error("Like failed:", err);
      // Rollback on failure
      setLikedPosts(prev => ({ ...prev, [postId]: wasLiked }));
      setPosts(prev =>
        prev.map(p =>
          String(p._id || p.id) === postId
            ? { ...p, likes: Math.max(0, (p.likes ?? 0) - delta) }
            : p
        )
      );
    }
  }, [username, recordInteraction]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowDown" || e.key === "j") {
        setCurrentIdx(i => Math.min(i + 1, posts.length - 1));
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        setCurrentIdx(i => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [posts.length]);

  // ── Scroll snap via wheel ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();
      if (isScrolling.current) return;
      isScrolling.current = true;
      setTimeout(() => { isScrolling.current = false; }, 700);

      if (e.deltaY > 0) setCurrentIdx(i => Math.min(i + 1, posts.length - 1));
      else              setCurrentIdx(i => Math.max(i - 1, 0));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [posts.length]);

  // ── Touch swipe ────────────────────────────────────────────────────────────
  const touchStartY = useRef(null);
  const onTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const onTouchEnd   = (e) => {
    if (touchStartY.current === null) return;
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(diff) > 40) {
      if (diff > 0) setCurrentIdx(i => Math.min(i + 1, posts.length - 1));
      else          setCurrentIdx(i => Math.max(i - 1, 0));
    }
    touchStartY.current = null;
  };

  // ── Snap scroll to current card ────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: currentIdx * window.innerHeight, behavior: "smooth" });
  }, [currentIdx]);

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.centerScreen}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Curating your feed…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centerScreen}>
        <p style={styles.errorText}>{error}</p>
        <button style={styles.retryBtn} onClick={fetchFeed}>Try again</button>
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div style={styles.centerScreen}>
        <p style={styles.emptyText}>No new posts for you — check back later!</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={styles.container}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      {posts.map((post, idx) => (
        <div key={post._id || post.id || idx} style={styles.slide}>
          <FYPCard
            post={post}
            username={username}
            onLike={handleLike}
            likedPosts={likedPosts}
            isProtected={isProtected}
          />
        </div>
      ))}

      {isProtected && <div style={styles.protectionOverlay}>Protected View Active</div>}

      {/* Progress dots */}
      <div style={styles.dotsContainer}>
        {posts.map((_, idx) => (
          <div
            key={idx}
            style={{
              ...styles.dot,
              ...(idx === currentIdx ? styles.dotActive : {}),
            }}
            onClick={() => setCurrentIdx(idx)}
          />
        ))}
      </div>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    width: "100%",
    height: "100vh",
    overflowY: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  slide: {
    width: "100%",
    height: "100vh",
    position: "relative",
    flexShrink: 0,
  },
  card: {
    width: "100%",
    height: "100%",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    userSelect: "none",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 30%, transparent 55%, rgba(0,0,0,0.75) 100%)",
    pointerEvents: "none",
  },
  topRow: {
    position: "absolute",
    top: "20px",
    left: "20px",
    right: "20px",
    display: "flex",
    alignItems: "flex-start",
  },
  serendipityBadge: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    backgroundColor: "rgba(255,255,255,0.15)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "20px",
    padding: "5px 12px",
    color: "#fff",
    fontSize: "12px",
    fontWeight: "500",
    letterSpacing: "0.02em",
  },
  serendipityIcon: {
    fontSize: "10px",
    color: "#a78bfa",
  },
  bottomRow: {
    position: "absolute",
    bottom: "40px",
    left: "20px",
    right: "20px",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "16px",
  },
  postMeta: {
    flex: 1,
    minWidth: 0,
  },
  postTitle: {
    color: "#fff",
    fontSize: "18px",
    fontWeight: "700",
    margin: "0 0 4px",
    textShadow: "0 1px 4px rgba(0,0,0,0.5)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  postDescription: {
    color: "rgba(255,255,255,0.8)",
    fontSize: "13px",
    margin: "0 0 8px",
    lineHeight: "1.4",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    textShadow: "0 1px 3px rgba(0,0,0,0.4)",
  },
  artistBtn: {
    background: "rgba(255,255,255,0.12)",
    backdropFilter: "blur(6px)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "16px",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "600",
    padding: "4px 12px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  artistAt: {
    color: "#a78bfa",
    marginRight: "1px",
  },
  actions: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    flexShrink: 0,
  },
  likeBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    background: "rgba(255,255,255,0.12)",
    backdropFilter: "blur(6px)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "50px",
    padding: "10px 14px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  likeBtnActive: {
    background: "rgba(239,68,68,0.25)",
    borderColor: "rgba(239,68,68,0.5)",
  },
  likeHeart: {
    fontSize: "22px",
    color: "#fff",
    lineHeight: 1,
  },
  likeCount: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
  },
  dotsContainer: {
    position: "fixed",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    zIndex: 100,
  },
  dot: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    backgroundColor: "rgba(255,255,255,0.3)",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  dotActive: {
    backgroundColor: "#fff",
    transform: "scale(1.4)",
  },
  centerScreen: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    gap: "24px",
  },
  spinner: {
    width: "48px",
    height: "48px",
    border: "3px solid rgba(255,255,255,0.1)",
    borderTop: "3px solid #a78bfa",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: { 
    color: "rgba(255,255,255,0.7)", 
    fontSize: "16px", 
    margin: 0,
    fontWeight: "500",
    letterSpacing: "0.02em",
    textAlign: "center",
  },
  errorText: { color: "#f87171", fontSize: "15px", margin: 0 },
  emptyText: { color: "rgba(255,255,255,0.5)", fontSize: "15px", margin: 0 },
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
  protectionOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(0,0,0,0.25)",
    backdropFilter: "blur(8px)",
    pointerEvents: "none",
    fontSize: "14px",
    fontWeight: "600",
    letterSpacing: "0.03em",
  },
};

// Inject keyframe for spinner
if (typeof document !== 'undefined') {
  const styleTag = document.createElement("style");
  styleTag.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(styleTag);
}

export default FYP;
