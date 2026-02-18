import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const PostModal = ({ post, username, onClose, onLike, isLiked }) => {
  const navigate = useNavigate();
  const [commentText, setCommentText] = useState("");

  if (!post) return null;

  const handleArtistClick = (e) => {
    e.stopPropagation();
    if (post.artistId) navigate(`/profile/${post.artistId}`);
  };

  const handleLike = (e) => {
    e.stopPropagation();
    onLike?.();
  };

  const handleCommentSubmit = (e) => {
    e.preventDefault();
    if (commentText.trim()) {
      console.log("Comment:", commentText);
      setCommentText("");
      // TODO: Send comment to backend
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div style={styles.content}>
          {/* Image */}
          <div style={styles.imageSection}>
            <img
              src={post.url}
              alt={post.title || "Artwork"}
              style={styles.image}
              draggable={false}
            />
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
                    disabled={!commentText.trim()}
                    style={{
                      ...styles.commentBtn,
                      ...(commentText.trim() ? {} : styles.commentBtnDisabled),
                    }}
                  >
                    Post
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    animation: "fadeIn 0.2s ease",
  },
  modal: {
    backgroundColor: "#1a1a1a",
    borderRadius: "12px",
    overflow: "hidden",
    maxWidth: "90%",
    maxHeight: "90vh",
    display: "flex",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.8)",
    animation: "slideUp 0.3s ease",
  },
  closeBtn: {
    position: "absolute",
    top: "12px",
    right: "12px",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "50%",
    width: "32px",
    height: "32px",
    fontSize: "18px",
    color: "#fff",
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
    maxHeight: "80vh",
  },
  imageSection: {
    flex: "0 0 50%",
    overflow: "hidden",
    backgroundColor: "#000",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    userSelect: "none",
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
    borderBottom: "1px solid rgba(167, 139, 250, 0.2)",
  },
  title: {
    color: "#fff",
    fontSize: "22px",
    fontWeight: "700",
    margin: "0 0 8px",
  },
  description: {
    color: "rgba(255, 255, 255, 0.7)",
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
    background: "rgba(167, 139, 250, 0.15)",
    border: "1px solid rgba(167, 139, 250, 0.3)",
    borderRadius: "20px",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "600",
    padding: "6px 14px",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s ease",
  },
  artistAt: {
    color: "#a78bfa",
    marginRight: "2px",
  },
  serendipityBadge: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    backgroundColor: "rgba(167, 139, 250, 0.15)",
    border: "1px solid rgba(167, 139, 250, 0.3)",
    borderRadius: "12px",
    padding: "4px 10px",
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "500",
  },
  serendipityIcon: {
    fontSize: "9px",
    color: "#a78bfa",
  },
  tagsSection: {
    paddingTop: "8px",
  },
  tagsLabel: {
    color: "rgba(255, 255, 255, 0.5)",
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
    backgroundColor: "rgba(167, 139, 250, 0.15)",
    border: "1px solid rgba(167, 139, 250, 0.3)",
    borderRadius: "12px",
    color: "#a78bfa",
    fontSize: "12px",
    padding: "4px 10px",
    whiteSpace: "nowrap",
  },
  commentsSection: {
    paddingTop: "16px",
    borderTop: "1px solid rgba(167, 139, 250, 0.1)",
  },
  commentsLabel: {
    color: "rgba(255, 255, 255, 0.5)",
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
    gap: "8px",
  },
  comment: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: "8px",
    padding: "8px 10px",
  },
  commentUser: {
    color: "#a78bfa",
    fontSize: "12px",
    fontWeight: "600",
    margin: "0 0 2px",
  },
  commentText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: "13px",
    margin: 0,
    wordBreak: "break-word",
  },
  noComments: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: "13px",
    margin: 0,
    fontStyle: "italic",
  },
  actions: {
    marginTop: "auto",
    paddingTop: "16px",
    borderTop: "1px solid rgba(167, 139, 250, 0.1)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  likeBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    background: "rgba(167, 139, 250, 0.15)",
    border: "1px solid rgba(167, 139, 250, 0.3)",
    borderRadius: "8px",
    padding: "8px 16px",
    color: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "14px",
    fontWeight: "600",
    transition: "all 0.2s ease",
  },
  likeBtnActive: {
    background: "rgba(239, 68, 68, 0.25)",
    borderColor: "rgba(239, 68, 68, 0.5)",
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
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(167, 139, 250, 0.3)",
    borderRadius: "4px",
    padding: "8px 12px",
    color: "#fff",
    fontSize: "13px",
    fontFamily: "inherit",
  },
  commentBtn: {
    background: "rgba(167, 139, 250, 0.3)",
    border: "1px solid rgba(167, 139, 250, 0.5)",
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
