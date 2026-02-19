import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const PostModal = ({ post, username, onClose, onLike, onComment, isLiked, isProtected = false }) => {
  const navigate = useNavigate();
  const [commentText, setCommentText] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  if (!post) return null;
  const processSlides = Array.isArray(post.processSlides)
    ? post.processSlides.filter((s) => typeof s === "string" && s.trim())
    : [];
  const slides = [...(post.url ? [post.url] : []), ...processSlides];
  const safeSlideIndex = Math.min(Math.max(slideIndex, 0), Math.max(slides.length - 1, 0));
  const currentSlide = slides[safeSlideIndex] || post.url || null;
  useEffect(() => {
    setSlideIndex(0);
  }, [post?._id, post?.id]);

  const handleArtistClick = (e) => {
    e.stopPropagation();
    if (post.artistId) navigate(`/profile/${post.artistId}`);
  };

  const handleLike = (e) => {
    e.stopPropagation();
    onLike?.();
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text || isPostingComment) return;
    try {
      setIsPostingComment(true);
      const ok = await onComment?.(text);
      if (ok) setCommentText("");
    } finally {
      setIsPostingComment(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div style={styles.content}>
          {/* Image */}
          <div style={styles.imageSection}>
            {currentSlide && (
              <img
                src={currentSlide}
                alt={post.title || "Artwork"}
                style={{
                  ...styles.image,
                  filter: isProtected ? "blur(26px)" : "none",
                }}
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
            )}
            {slides.length > 1 && (
              <>
                <button
                  style={{ ...styles.slideBtn, left: "12px" }}
                  onClick={() => setSlideIndex((prev) => Math.max(0, prev - 1))}
                  disabled={safeSlideIndex === 0}
                >
                  &lt;
                </button>
                <button
                  style={{ ...styles.slideBtn, right: "12px" }}
                  onClick={() => setSlideIndex((prev) => Math.min(slides.length - 1, prev + 1))}
                  disabled={safeSlideIndex === slides.length - 1}
                >
                  &gt;
                </button>
                <div style={styles.slideCounter}>
                  Slide {safeSlideIndex + 1} / {slides.length}
                </div>
              </>
            )}
          </div>

          {/* Info Panel */}
          <div style={styles.infoPanel}>
            {/* Title & Description */}
            <div style={styles.header}>
              {post.title && <h2 style={styles.title}>{post.title}</h2>}
              {post.description && (
                <p style={styles.description}>{post.description}</p>
              )}
            </div>

            {/* Artist Info */}
            <div style={styles.artistSection}>
              <button style={styles.artistBtn} onClick={handleArtistClick}>
                <span style={styles.artistAt}>@</span>
                {post.user}
              </button>
              {post.is_serendipity && (
                <div style={styles.serendipityBadge}>
                  <span style={styles.serendipityIcon}>✦</span> Discovered for you
                </div>
              )}
            </div>

            {/* Tags */}
            {post.mlTags && Object.keys(post.mlTags).length > 0 && (
              <div style={styles.tagsSection}>
                <p style={styles.tagsLabel}>Tags:</p>
                <div style={styles.tagsList}>
                  {Object.entries(post.mlTags).map(([category, tags]) => {
                    if (!Array.isArray(tags)) return null;
                    return tags.slice(0, 3).map((tag, idx) => (
                      <span key={`${category}-${idx}`} style={styles.tag}>
                        {tag.label}
                      </span>
                    ));
                  })}
                </div>
              </div>
            )}

            {/* Comments Section */}
            <div style={styles.commentsSection}>
              <p style={styles.commentsLabel}>Comments ({post.comments?.length || 0})</p>
              <div style={styles.commentsList}>
                {post.comments && post.comments.length > 0 ? (
                  post.comments.map((comment, idx) => (
                    <div key={idx} style={styles.comment}>
                      <p style={styles.commentUser}>{comment.user}</p>
                      <p style={styles.commentText}>{comment.text}</p>
                    </div>
                  ))
                ) : (
                  <p style={styles.noComments}>No comments yet</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={styles.actions}>
              <button
                style={{
                  ...styles.likeBtn,
                  ...(isLiked ? styles.likeBtnActive : {}),
                }}
                onClick={handleLike}
                aria-label={isLiked ? "Unlike" : "Like"}
              >
                <span style={styles.likeHeart}>{isLiked ? "♥" : "♡"}</span>
                <span style={styles.likeCount}>{post.likes ?? 0}</span>
              </button>

              {username && (
                <form style={styles.commentForm} onSubmit={handleCommentSubmit}>
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    style={styles.commentInput}
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim() || isPostingComment}
                    style={{
                      ...styles.commentBtn,
                      ...(commentText.trim() && !isPostingComment ? {} : styles.commentBtnDisabled),
                    }}
                  >
                    {isPostingComment ? "Posting..." : "Post"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
      {isProtected && <div style={styles.protectionOverlay}>Protected View Active</div>}
    </div>
  );
};

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(74, 74, 74, 0.45)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    animation: "fadeIn 0.2s ease",
  },
  modal: {
    backgroundColor: "#FDFBF7",
    borderRadius: "14px",
    overflow: "hidden",
    width: "min(1100px, 92vw)",
    height: "min(720px, 88vh)",
    display: "flex",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.22)",
    animation: "slideUp 0.3s ease",
  },
  closeBtn: {
    position: "absolute",
    top: "12px",
    right: "12px",
    backgroundColor: "rgba(253, 251, 247, 0.9)",
    border: "1px solid rgba(165, 165, 141, 0.4)",
    borderRadius: "50%",
    width: "32px",
    height: "32px",
    fontSize: "18px",
    color: "#4A4A4A",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    transition: "all 0.2s ease",
  },
  content: {
    display: "flex",
    width: "100%",
    height: "100%",
  },
  imageSection: {
    flex: "0 0 50%",
    overflow: "hidden",
    backgroundColor: "#E8E4D9",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    userSelect: "none",
  },
  slideBtn: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: "34px",
    height: "34px",
    borderRadius: "999px",
    border: "none",
    backgroundColor: "rgba(255,255,255,0.85)",
    color: "#222",
    fontSize: "18px",
    fontWeight: 700,
    cursor: "pointer",
    zIndex: 12,
  },
  slideCounter: {
    position: "absolute",
    bottom: "10px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    fontSize: "12px",
    borderRadius: "999px",
    padding: "4px 10px",
    zIndex: 12,
  },
  infoPanel: {
    flex: "1",
    padding: "24px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    paddingBottom: "12px",
    borderBottom: "1px solid rgba(165, 165, 141, 0.3)",
  },
  title: {
    color: "#333",
    fontSize: "22px",
    fontWeight: "700",
    margin: "0 0 8px",
  },
  description: {
    color: "#555",
    fontSize: "14px",
    margin: 0,
    lineHeight: "1.5",
  },
  artistSection: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  artistBtn: {
    background: "rgba(165, 165, 141, 0.16)",
    border: "1px solid rgba(165, 165, 141, 0.4)",
    borderRadius: "20px",
    color: "#4A4A4A",
    fontSize: "13px",
    fontWeight: "600",
    padding: "6px 14px",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s ease",
  },
  artistAt: {
    color: "#CB997E",
    marginRight: "2px",
  },
  serendipityBadge: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    backgroundColor: "rgba(165, 165, 141, 0.16)",
    border: "1px solid rgba(165, 165, 141, 0.4)",
    borderRadius: "12px",
    padding: "4px 10px",
    fontSize: "11px",
    color: "#6B705C",
    fontWeight: "500",
  },
  serendipityIcon: {
    fontSize: "9px",
    color: "#CB997E",
  },
  tagsSection: {
    paddingTop: "8px",
  },
  tagsLabel: {
    color: "#888",
    fontSize: "12px",
    fontWeight: "600",
    margin: "0 0 8px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  tagsList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  tag: {
    backgroundColor: "rgba(165, 165, 141, 0.16)",
    border: "1px solid rgba(165, 165, 141, 0.4)",
    borderRadius: "12px",
    color: "#6B705C",
    fontSize: "12px",
    padding: "4px 10px",
    whiteSpace: "nowrap",
  },
  commentsSection: {
    paddingTop: "16px",
    borderTop: "1px solid rgba(45, 27, 27, 0.08)",
  },
  commentsLabel: {
    color: "#888",
    fontSize: "12px",
    fontWeight: "600",
    margin: "0 0 8px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  commentsList: {
    maxHeight: "200px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "16px 20px",
  },
  comment: {
    marginBottom: "12px",
    fontSize: "14px",
    color: "#555",
    background: "none",
    border: "none",
    padding: 0,
  },
  commentUser: {
    color: "#2D1B1B",
    fontSize: "14px",
    fontWeight: "700",
    margin: "0 0 4px",
  },
  commentText: {
    color: "#555",
    fontSize: "14px",
    margin: 0,
    wordBreak: "break-word",
  },
  noComments: {
    color: "#A5A58D",
    fontSize: "13px",
    margin: 0,
    fontStyle: "italic",
    textAlign: "center",
  },
  actions: {
    marginTop: "auto",
    paddingTop: "16px",
    borderTop: "1px solid rgba(165, 165, 141, 0.2)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  likeBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    background: "rgba(165, 165, 141, 0.16)",
    border: "1px solid rgba(165, 165, 141, 0.4)",
    borderRadius: "8px",
    padding: "8px 16px",
    color: "#4A4A4A",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "14px",
    fontWeight: "600",
    transition: "all 0.2s ease",
  },
  likeBtnActive: {
    background: "rgba(203, 153, 126, 0.2)",
    borderColor: "rgba(203, 153, 126, 0.6)",
  },
  likeHeart: {
    fontSize: "18px",
  },
  likeCount: {
    fontSize: "13px",
  },
  commentForm: {
    display: "flex",
    gap: "8px",
  },
  commentInput: {
    flex: 1,
    background: "rgba(232, 228, 217, 0.6)",
    border: "1px solid rgba(165, 165, 141, 0.45)",
    borderRadius: "4px",
    padding: "8px 12px",
    color: "#4A4A4A",
    fontSize: "13px",
    fontFamily: "inherit",
  },
  commentBtn: {
    background: "#A5A58D",
    border: "1px solid #A5A58D",
    borderRadius: "4px",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "600",
    padding: "8px 16px",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s ease",
  },
  commentBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  protectionOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1100,
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#4A4A4A",
    backgroundColor: "rgba(253, 251, 247, 0.18)",
    backdropFilter: "blur(8px)",
    fontSize: "13px",
    fontWeight: "700",
  },
};

// Inject animations
if (typeof document !== "undefined") {
  const styleTag = document.createElement("style");
  styleTag.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  if (!document.head.querySelector("style[data-animations]")) {
    styleTag.setAttribute("data-animations", "true");
    document.head.appendChild(styleTag);
  }
}

export default PostModal;
