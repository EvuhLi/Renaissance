import React, { useEffect, useRef, useState, memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { GiShirtButton } from "react-icons/gi";

const drawImageToCanvas = (canvas, img, fit = "cover") => {
  if (!canvas || !img) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const { clientWidth, clientHeight } = canvas;
  if (!clientWidth || !clientHeight) return;

  canvas.width = Math.floor(clientWidth * dpr);
  canvas.height = Math.floor(clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, clientWidth, clientHeight);

  const imgRatio = img.width / img.height;
  const canvasRatio = clientWidth / clientHeight;
  let drawWidth, drawHeight, dx, dy;

  if (fit === "contain") {
    if (imgRatio > canvasRatio) {
      drawWidth = clientWidth;
      drawHeight = clientWidth / imgRatio;
      dx = 0;
      dy = (clientHeight - drawHeight) / 2;
    } else {
      drawHeight = clientHeight;
      drawWidth = clientHeight * imgRatio;
      dx = (clientWidth - drawWidth) / 2;
      dy = 0;
    }
  } else {
    if (imgRatio > canvasRatio) {
      drawHeight = clientHeight;
      drawWidth = clientHeight * imgRatio;
      dx = (clientWidth - drawWidth) / 2;
      dy = 0;
    } else {
      drawWidth = clientWidth;
      drawHeight = clientWidth / imgRatio;
      dx = 0;
      dy = (clientHeight - drawHeight) / 2;
    }
  }

  ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
};

const CanvasImage = ({ src, fit = "cover", canvasStyle }) => {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    imgRef.current = img;
    img.crossOrigin = "anonymous";
    img.onload = () => drawImageToCanvas(canvasRef.current, img, fit);
    img.src = src;

    const handleResize = () => {
      if (imgRef.current) drawImageToCanvas(canvasRef.current, imgRef.current, fit);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [src, fit]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "100%", ...canvasStyle }}
    />
  );
};

// ==========================================
// MEMOIZED COMMENT COMPONENT
// ==========================================
const CommentItem = memo(({ comment, index }) => {
  return (
    <div
      style={{
        marginBottom: "12px",
        fontSize: "14px",
        color: "#555",
        padding: "8px 0",
      }}
    >
      <strong style={{ color: "#2D1B1B" }}>{comment.user}</strong>
      <span style={{ marginLeft: "8px" }}>{comment.text}</span>
      <div style={{ color: "#999", fontSize: "12px", marginTop: "4px" }}>
        {comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ""}
      </div>
    </div>
  );
});

// ==========================================
// TAG RENDERING HELPERS
// ==========================================

const INITIAL_VISIBLE = 5; 

const CATEGORY_LABELS = {
  medium: "medium",
  subject: "subject",
  style: "style",
  mood: "mood",
  color_palette: "palette",
  aesthetic_features: "aesthetic",
};

const resolveTagsForDisplay = (post) => {
  const mlTags = post.mlTags;

  if (!mlTags || Object.keys(mlTags).length === 0) {
    const legacyTags = (post.tags || []).map((label) => ({ label, confidence: null }));
    return { manualTags: legacyTags, autoTags: [] };
  }

  const manualTags = (mlTags.manual || []).map((t) => ({
    label: t.label,
    confidence: t.confidence,
  }));

  const autoTags = Object.entries(mlTags)
    .filter(([cat]) => cat !== "manual")
    .flatMap(([category, tags]) =>
      tags.map((t) => ({ label: t.label, confidence: t.confidence, category }))
    )
    .sort((a, b) => b.confidence - a.confidence);

  return { manualTags, autoTags };
};

// ==========================================
// COLLAPSIBLE TAG GROUP
// ==========================================
const TagGroup = ({ label, tags, tagStyle, showCategory = false }) => {
  const [expanded, setExpanded] = useState(false);

  if (!tags || tags.length === 0) return null;

  const visible = expanded ? tags : tags.slice(0, INITIAL_VISIBLE);
  const hiddenCount = tags.length - INITIAL_VISIBLE;

  return (
    <div style={styles.tagGroup}>
      <span style={styles.tagGroupLabel}>{label}</span>
      <div style={styles.tagRow}>
        {visible.map((tag, i) => (
          <span key={`${label}-${i}`} style={tagStyle}>
            #{tag.label}
            {showCategory && tag.category && (
              <span style={styles.tagCategory}>
                {CATEGORY_LABELS[tag.category] || tag.category}
              </span>
            )}
          </span>
        ))}

        {!expanded && hiddenCount > 0 && (
          <button
            style={styles.expandBtn}
            onClick={() => setExpanded(true)}
          >
            +{hiddenCount} more
          </button>
        )}
        {expanded && hiddenCount > 0 && (
          <button
            style={styles.expandBtn}
            onClick={() => setExpanded(false)}
          >
            show less
          </button>
        )}
      </div>
    </div>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================
const Post = ({
  posts,
  user,
  isProtected,
  selectedPost,
  setSelectedPost,
  likedPosts,
  toggleButton,
  addComment,
  deletePost
}) => {
  // Local state to prevent rapid-fire clicking
  const [isProcessing, setIsProcessing] = useState(false);
  // Local optimistic state to reduce lag and avoid transient negative counts
  const [localLiked, setLocalLiked] = useState(null);
  const [localLikes, setLocalLikes] = useState(null);

  // Sync optimistic state when selectedPost or likedPosts change from parent
  useEffect(() => {
    if (!selectedPost) {
      setLocalLiked(null);
      setLocalLikes(null);
      return;
    }
    const postId = String(selectedPost._id || selectedPost.id);
    const currentLiked = !!(likedPosts?.[postId]);
    setLocalLiked(currentLiked);
    setLocalLikes(typeof selectedPost.likes === "number" ? selectedPost.likes : 0);
  }, [selectedPost, likedPosts]);

  const handleLikeClick = async (postId) => {
    if (isProcessing) return;
    setIsProcessing(true);
    console.debug("handleLikeClick: start", { postId, isProcessing });
    // Optimistically update local UI immediately to reduce perceived lag
    setLocalLiked((prev) => {
      const next = !prev;
      setLocalLikes((l) => Math.max(0, (typeof l === "number" ? l : 0) + (next ? 1 : -1)));
      return next;
    });

    // Call the parent toggle function (may update server / parent state)
    try {
      const result = await toggleButton(postId);
      console.debug("handleLikeClick: toggleButton result", result);
    } catch (err) {
      // On error, revert optimistic change
      setLocalLiked((prev) => {
        const reverted = !prev;
        setLocalLikes((l) => Math.max(0, (typeof l === "number" ? l : 0) + (reverted ? 1 : -1)));
        return reverted;
      });
    } finally {
      // Brief delay to let the state settle and prevent "button spam"
      setTimeout(() => setIsProcessing(false), 400);
    }
  };

  const [commentText, setCommentText] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const [commentsPage, setCommentsPage] = useState(0);
  const [loadedComments, setLoadedComments] = useState({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const COMMENTS_PER_PAGE = 15;

  // Fetch comments on-demand from the backend
  const fetchComments = async (postId, page = 0) => {
    if (commentsLoading) return;
    try {
      setCommentsLoading(true);
      const res = await fetch(
        `http://localhost:3001/api/posts/${postId}/comments?page=${page}&limit=${COMMENTS_PER_PAGE}`
      );
      if (!res.ok) throw new Error("Failed to fetch comments");
      const data = await res.json();
      
      // Merge with existing comments
      setLoadedComments(prev => ({
        ...prev,
        [postId]: {
          comments: page === 0 ? data.comments : [...(prev[postId]?.comments || []), ...data.comments],
          total: data.total,
          hasMore: data.hasMore
        }
      }));
    } catch (err) {
      console.error("Comments fetch error:", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    setSlideIndex(0);
    setCommentsPage(0);
    const postId = String(selectedPost?._id || selectedPost?.id);
    
    // If selectedPost already has comments, use them directly
    if (selectedPost?.comments && Array.isArray(selectedPost.comments)) {
      setLoadedComments(prev => ({
        ...prev,
        [postId]: {
          comments: selectedPost.comments,
          total: selectedPost.comments.length,
          hasMore: false
        }
      }));
    } else if (selectedPost?._id) {
      // Only fetch if we don't have comments data
      fetchComments(selectedPost._id, 0);
    }
  }, [selectedPost]);

  const slidesFor = (post) => {
    if (!post) return [];
    const processSlides = Array.isArray(post.processSlides)
      ? post.processSlides.filter((s) => typeof s === "string" && s.trim())
      : [];
    const cover = post.url ? [post.url] : [];
    return [...cover, ...processSlides];
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentText || !commentText.trim()) return;
    if (!selectedPost) return;
    const postId = String(selectedPost._id || selectedPost.id);
    const newCommentText = commentText.trim();
    try {
      const result = await addComment(postId, newCommentText);
      let newComment = null;
      if (result && result.comments && Array.isArray(result.comments) && result.comments.length > 0) {
        newComment = result.comments[result.comments.length - 1];
      }
      if (!newComment) {
        newComment = {
          user: user?.username || "",
          text: newCommentText,
          createdAt: new Date().toISOString(),
        };
      }
      setLoadedComments(prev => {
        const existing = prev[postId] || { comments: [], total: 0, hasMore: false };
        return {
          ...prev,
          [postId]: {
            comments: [newComment, ...existing.comments],
            total: (existing.total || 0) + 1,
            hasMore: existing.hasMore
          }
        };
      });
      setCommentText("");
    } catch (err) {
      console.error("Comment submit failed:", err);
    }
  };

  return (
    <>
      <div style={styles.grid} className="post-grid">
        {posts.map((post) => (
          <div
            key={String(post._id || post.id)}
            style={styles.gridItem}
            className="post-grid-item"
            onClick={() => setSelectedPost(post)}
          >
            <div style={styles.artworkWrapper}>
              <CanvasImage
                src={post.url}
                fit="cover"
                canvasStyle={{ filter: isProtected ? "blur(30px)" : "none" }}
              />
            </div>
            {(post.title || post.description) && (
              <div style={styles.gridTitle} className="post-grid-title">
                {post.title || post.description}
              </div>
            )}
            <div
              onContextMenu={(e) => {
                e.preventDefault();
                alert("Image export restricted.");
              }}
              className="post-grid-overlay"
              style={styles.gridOverlay}
            />
          </div>
        ))}
      </div>

      {selectedPost && (
        <div style={styles.modalOverlay} onClick={() => setSelectedPost(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            {(() => {
              const slides = slidesFor(selectedPost);
              const safeIndex = Math.min(Math.max(slideIndex, 0), Math.max(slides.length - 1, 0));
              const currentSlide = slides[safeIndex] || selectedPost.url;
              return (
                <>

            {/* IMAGE SIDE */}
            <div style={styles.modalImageSide}>
              <div style={styles.modalCanvasWrap}>
                <CanvasImage
                  src={currentSlide}
                  fit="contain"
                  canvasStyle={{
                    ...styles.modalImg,
                    filter: isProtected ? "blur(30px)" : "none",
                  }}
                />
              </div>
              {slides.length > 1 && (
                <>
                  <button
                    style={{ ...styles.slideBtn, left: "12px" }}
                    onClick={() => setSlideIndex((prev) => Math.max(0, prev - 1))}
                    disabled={safeIndex === 0}
                  >
                    ‹
                  </button>
                  <button
                    style={{ ...styles.slideBtn, right: "12px" }}
                    onClick={() =>
                      setSlideIndex((prev) => Math.min(slides.length - 1, prev + 1))
                    }
                    disabled={safeIndex === slides.length - 1}
                  >
                    ›
                  </button>
                  <div style={styles.slideCounter}>
                    Slide {safeIndex + 1} / {slides.length}
                  </div>
                </>
              )}
              <div onContextMenu={(e) => e.preventDefault()} style={styles.ghostLayer} />
            </div>

            {/* INFO SIDE */}
            <div style={styles.modalInfoSide}>
              <div style={styles.modalHeader}>
                <strong>
                  {(() => {
                    const postUser = selectedPost.user;
                    const postUsername =
                      postUser && typeof postUser === "object"
                        ? postUser.username
                        : postUser;
                    const rawArtistId =
                      selectedPost.artistId ||
                      (postUser && typeof postUser === "object"
                        ? postUser._id
                        : undefined);
                    const postArtistId =
                      rawArtistId && typeof rawArtistId === "object"
                        ? rawArtistId.$oid || String(rawArtistId)
                        : rawArtistId;
                    const label = postUsername || user.username || postArtistId;
                    if (postArtistId) {
                      return <Link to={`/profile/${postArtistId}`} style={{ color: "black", textDecoration: "none" }}>{label}</Link>;
                    }
                    return label;
                  })()}
                </strong>

                {/* --- ADDED DELETE BUTTON LOGIC --- */}
                {(() => {
                  // Figure out if the logged-in user owns this post
                  const postArtistId = selectedPost.artistId?.$oid || selectedPost.artistId || (typeof selectedPost.user === 'object' ? selectedPost.user._id : undefined);
                  const currentUserId = user?._id?.$oid || user?._id || user?.id;
                  
                  // Also check username as a fallback if IDs don't match or are missing
                  const postUsername = typeof selectedPost.user === 'object' ? selectedPost.user.username : selectedPost.user;
                  const currentUsername = user?.username;

                  const isOwner = (postArtistId && currentUserId && String(postArtistId) === String(currentUserId)) || 
                                  (postUsername && currentUsername && postUsername === currentUsername);

                  if (isOwner && deletePost) {
                    return (
                      <button 
                        style={styles.deleteBtn}
                        onClick={(e) => {
                          e.stopPropagation(); // Prevents the click from bleeding through
                          
                          if (window.confirm("Are you sure you want to delete this artwork?")) {
                            const postId = String(selectedPost._id || selectedPost.id);
                            
                            // 1. Close the modal IMMEDIATELY for a smooth user experience
                            setSelectedPost(null); 
                            
                            // 2. Fire off the delete function in the background 
                            // (Notice we removed 'await' so it doesn't freeze the screen)
                            deletePost(postId); 
                          }
                        }}
                      >
                        🗑️
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>

              <div style={styles.modalMeta}>
                {selectedPost.title && (
                  <div style={styles.title}>{selectedPost.title}</div>
                )}
                {selectedPost.description && (
                  <div style={styles.description}>{selectedPost.description}</div>
                )}

                {/* ---- TAG SECTION ---- */}
                {(() => {
                  const { manualTags, autoTags } = resolveTagsForDisplay(selectedPost);
                  const hasAny = manualTags.length > 0 || autoTags.length > 0;
                  if (!hasAny) return null;

                  return (
                    <div style={styles.tagSection}>
                      <TagGroup
                        label="Your tags"
                        tags={manualTags}
                        tagStyle={styles.tagManual}
                        showCategory={false}
                      />
                      <TagGroup
                        label="Loom tags"
                        tags={autoTags}
                        tagStyle={styles.tagAuto}
                        showCategory={true}
                      />
                    </div>
                  );
                })()}
              </div>

              <div style={styles.modalActions}>
                <div style={{ fontSize: "50px", marginBottom: "5px", display: "flex", alignItems: "center", gap: "15px" }}>
                  {(() => {
                    const postId = String(selectedPost._id || selectedPost.id);
                    const propLiked = !!likedPosts?.[postId];
                    const isLiked = localLiked === null ? propLiked : !!localLiked;
                    return (
                      <GiShirtButton
                        onClick={() => handleLikeClick(postId)}
                        style={{
                          cursor: isProcessing ? "default" : "pointer",
                          color: isLiked ? "#000000" : "#ffffff",
                          filter: isLiked
                            ? "none"
                            : "drop-shadow(0px 0px 2px rgba(0,0,0,0.3))",
                          transition: "all 0.2s ease",
                          transform: isLiked ? "scale(1.1)" : "scale(1)",
                          opacity: isProcessing ? 0.7 : 1
                        }}
                      />
                    );
                  })()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong>{Math.max(0, (localLikes ?? selectedPost.likes ?? 0))} buttons</strong>
                  <strong style={{ color: "#8e8e8e", fontSize: "14px" }}>
                    {loadedComments[String(selectedPost._id || selectedPost.id)]?.total || 0} threads
                  </strong>
                </div>
              </div>

              <div style={styles.commentList}>
                {(() => {
                  const postId = String(selectedPost._id || selectedPost.id);
                  const commentData = loadedComments[postId];
                  const allComments = commentData?.comments || [];
                  const hasMore = commentData?.hasMore || false;

                  return (
                    <>
                      {allComments.length === 0 && !commentsLoading && (
                        <p style={{ color: "#999", fontSize: "14px", textAlign: "center", padding: "20px" }}>
                          No comments yet. Be the first!
                        </p>
                      )}
                      {allComments.map((c, idx) => (
                        <CommentItem key={c._id || c.createdAt || `${c.user}-${idx}`} comment={c} index={idx} />
                      ))}
                      {commentsLoading && (
                        <p style={{ color: "#999", fontSize: "12px", textAlign: "center" }}>Loading...</p>
                      )}
                      {hasMore && !commentsLoading && (
                        <button
                          onClick={() => {
                            setCommentsPage(p => p + 1);
                            fetchComments(postId, commentsPage + 1);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#A63D3D",
                            fontWeight: "700",
                            cursor: "pointer",
                            fontSize: "14px",
                            padding: "8px 0",
                            marginTop: "8px",
                          }}
                        >
                          Load more comments...
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>

              <form style={styles.commentForm} onSubmit={handleCommentSubmit}>
                <input
                  type="text"
                  placeholder="Add a comment..."
                  style={styles.commentInput}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <button type="submit" style={styles.postBtn}>Post</button>
              </form>
            </div>
                </>
              );
            })()}
        </div>
        </div>
      )}
    </>
  );
};

const styles = {
  grid: { 
    display: "grid", 
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", 
    gap: "16px",
    padding: "20px",
  },
  gridItem: {
    position: "relative",
    aspectRatio: "1/1",
    cursor: "pointer",
    overflow: "hidden",
    backgroundColor: "#f5f1e8",
    borderRadius: "12px",
    border: "1px solid rgba(45, 27, 27, 0.1)",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  },
  artworkWrapper: { 
    width: "100%", 
    height: "100%",
  },
  gridOverlay: {
    position: "absolute",
    top: 0, left: 0,
    width: "100%", height: "100%",
    zIndex: 8,
    backgroundImage: 'url("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")',
  },
  gridTitle: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    padding: "12px 12px",
    fontSize: "14px",
    color: "#2D1B1B",
    background: "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,251,243,0.95) 100%)",
    zIndex: 12,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    pointerEvents: "none",
    fontWeight: "600",
  },
  modalOverlay: {
    position: "fixed",
    top: 0, left: 0,
    width: "100%", height: "100%",
    backgroundColor: "rgba(0,0,0,0.7)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    display: "flex",
    backgroundColor: "#fffdf8",
    width: "90%",
    maxWidth: "1000px",
    height: "650px",
    borderRadius: "16px",
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  modalImageSide: {
    flex: 1.5,
    backgroundColor: "#f5f1e8",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  slideBtn: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "none",
    backgroundColor: "rgba(45, 27, 27, 0.15)",
    color: "#2D1B1B",
    fontSize: "24px",
    lineHeight: 1,
    cursor: "pointer",
    zIndex: 20,
    transition: "all 0.2s ease",
  },
  slideCounter: {
    position: "absolute",
    bottom: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(45, 27, 27, 0.8)",
    color: "#fff",
    fontSize: "12px",
    borderRadius: "20px",
    padding: "6px 14px",
    zIndex: 20,
    fontWeight: "500",
  },
  modalCanvasWrap: {
    width: "100%", height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalImg: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
  ghostLayer: {
    position: "absolute",
    top: 0, left: 0,
    width: "100%", height: "100%",
    zIndex: 11,
  },
  modalInfoSide: { flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" },
  modalHeader: { 
    padding: "15px", 
    borderBottom: "1px solid #efefef",
    display: "flex", // Added for layout
    justifyContent: "space-between", // Pushes the trash can to the right
    alignItems: "center"
  },
  deleteBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "18px",
    opacity: 0.6,
    transition: "opacity 0.2s",
  },
  modalMeta: {
    padding: "16px 20px",
    borderBottom: "1px solid rgba(45, 27, 27, 0.08)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  title: { 
    fontSize: "18px", 
    fontWeight: "700", 
    color: "#2D1B1B" 
  },
  description: { 
    fontSize: "14px", 
    color: "#555",
    lineHeight: "1.5",
  },
  tagSection: { 
    display: "flex", 
    flexDirection: "column", 
    gap: "12px",
    padding: "16px 20px",
  },
  tagGroup: { 
    display: "flex", 
    flexDirection: "column", 
    gap: "8px" 
  },
  tagGroupLabel: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#A63D3D",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  tagRow: { 
    display: "flex", 
    flexWrap: "wrap", 
    gap: "8px", 
    alignItems: "center" 
  },
  tagManual: {
    fontSize: "13px",
    color: "#A63D3D",
    backgroundColor: "rgba(166, 61, 61, 0.08)",
    borderRadius: "14px",
    padding: "5px 12px",
    fontWeight: "600",
    border: "1px solid rgba(166, 61, 61, 0.2)",
  },
  tagAuto: {
    fontSize: "13px",
    color: "#555",
    backgroundColor: "#f0ebe5",
    borderRadius: "14px",
    padding: "5px 12px",
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    border: "1px solid rgba(45, 27, 27, 0.08)",
  },
  tagCategory: {
    fontSize: "10px",
    color: "#888",
    backgroundColor: "rgba(45, 27, 27, 0.06)",
    borderRadius: "8px",
    padding: "2px 6px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  expandBtn: {
    fontSize: "12px",
    color: "#A63D3D",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "2px 4px",
    fontWeight: "700",
  },
  commentList: { 
    flex: 1, 
    padding: "16px 20px", 
    overflowY: "auto" 
  },
  commentItem: { 
    marginBottom: "12px", 
    fontSize: "14px",
    color: "#555",
  },
  modalActions: { 
    padding: "16px 20px", 
    borderTop: "1px solid rgba(45, 27, 27, 0.08)" 
  },
  commentForm: { 
    display: "flex", 
    borderTop: "1px solid rgba(45, 27, 27, 0.08)", 
    padding: "12px 20px",
    gap: "12px",
  },
  commentInput: { 
    flex: 1, 
    border: "1px solid rgba(45, 27, 27, 0.12)",
    outline: "none",
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "14px",
  },
  postBtn: {
    background: "none",
    border: "none",
    color: "#A63D3D",
    fontWeight: "700",
    cursor: "pointer",
    fontSize: "14px",
  },
};

export default Post;
