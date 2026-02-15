import React, { useEffect, useRef } from "react";
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
  let drawWidth;
  let drawHeight;
  let dx;
  let dy;

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

const CanvasImage = ({ src, fit = "cover", style, canvasStyle }) => {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    imgRef.current = img;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      drawImageToCanvas(canvasRef.current, img, fit);
    };
    img.src = src;

    const handleResize = () => {
      if (imgRef.current) {
        drawImageToCanvas(canvasRef.current, imgRef.current, fit);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [src, fit]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "100%", ...canvasStyle }}
    />
  );
};

const Post = ({
  posts,
  user,
  isProtected,
  selectedPost,
  setSelectedPost,
  likedPosts,
  toggleButton,
}) => {
  return (
    <>
      <div style={styles.grid}>
        {posts.map((post) => (
          <div
            key={post._id || post.id}
            style={styles.gridItem}
            className="post-grid-item"
            onClick={() => setSelectedPost(post)}
          >
            <div style={styles.artworkWrapper}>
              <CanvasImage
                src={post.url}
                fit="cover"
                canvasStyle={{
                  filter: isProtected ? "blur(30px)" : "none",
                }}
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
            <div style={styles.modalImageSide}>
              <div style={styles.modalCanvasWrap}>
                <CanvasImage
                  src={selectedPost.url}
                  fit="contain"
                  canvasStyle={{
                    ...styles.modalImg,
                    filter: isProtected ? "blur(30px)" : "none",
                  }}
                />
              </div>
              <div
                onContextMenu={(e) => e.preventDefault()}
                style={styles.ghostLayer}
              />
            </div>

            <div style={styles.modalInfoSide}>
              <div style={styles.modalHeader}>
                <strong>
                  {(() => {
                    const postUser = selectedPost.user;
                    if (postUser && typeof postUser === "object") {
                      return postUser.username || user.username;
                    }
                    return postUser || user.username;
                  })()}
                </strong>
              </div>
              {(selectedPost.title || selectedPost.description || (selectedPost.tags || []).length > 0) && (
                <div style={styles.modalMeta}>
                  {selectedPost.title && (
                    <div style={styles.title}>
                      {selectedPost.title}
                    </div>
                  )}
                  {selectedPost.description && (
                    <div style={styles.description}>
                      {selectedPost.description}
                    </div>
                  )}
                  {(selectedPost.tags || []).length > 0 && (
                    <div style={styles.tags}>
                      {(selectedPost.tags || []).map((tag, index) => (
                        <span key={`${tag}-${index}`} style={styles.tag}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={styles.modalActions}>
                <div
                  style={{
                    fontSize: "50px",
                    marginBottom: "5px",
                    display: "flex",
                    alignItems: "center",
                    gap: "15px",
                  }}
                >
                  {(() => {
                    const postId = selectedPost._id || selectedPost.id;
                    const isLiked = !!likedPosts[postId];
                    return (
                      <GiShirtButton
                        onClick={() => toggleButton(postId)}
                        style={{
                          cursor: "pointer",
                          color: isLiked ? "black" : "white",
                          filter: isLiked
                            ? "none"
                            : "drop-shadow(0px 0px 1px rgba(0,0,0,0.5))",
                          transition: "color 0.2s ease",
                        }}
                      />
                    );
                  })()}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  {(() => {
                    const baseLikes = selectedPost.likes ?? 0;
                    return (
                      <strong>
                        {baseLikes} buttons
                      </strong>
                    );
                  })()}
                  <strong style={{ color: "#8e8e8e", fontSize: "14px" }}>
                    {(selectedPost.comments || []).length} threads
                  </strong>
                </div>
              </div>
              <div style={styles.commentList}>
                {(selectedPost.comments || []).map((c, index) => (
                  <div
                    key={c._id || c.createdAt || `${c.user || "comment"}-${index}`}
                    style={styles.commentItem}
                  >
                    <strong>{c.user}</strong> {c.text}
                  </div>
                ))}
              </div>

              <form
                style={styles.commentForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  setSelectedPost(null);
                }}
              >
                <input
                  type="text"
                  placeholder="Add a comment..."
                  style={styles.commentInput}
                />
                <button type="submit" style={styles.postBtn}>
                  Post
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const styles = {
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "28px" },
  gridItem: {
    position: "relative",
    aspectRatio: "1/1",
    cursor: "pointer",
    overflow: "hidden",
    backgroundColor: "#000",
  },
  artworkWrapper: {
    width: "100%",
    height: "100%",
  },
  artwork: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transition: "filter 0.1s ease-out",
  },
  gridOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 8,
    backgroundImage:
      'url("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")',
  },
  gridTitle: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "8px 10px",
    fontSize: "13px",
    color: "#fff",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%)",
    zIndex: 12,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    pointerEvents: "none",
  },

  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.8)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    display: "flex",
    backgroundColor: "#fff",
    width: "90%",
    maxWidth: "900px",
    height: "600px",
    borderRadius: "4px",
    overflow: "hidden",
  },
  modalImageSide: {
    flex: 1.5,
    backgroundColor: "#000",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCanvasWrap: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalImg: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
  ghostLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 11,
  },
  modalInfoSide: { flex: 1, display: "flex", flexDirection: "column" },
  modalHeader: { padding: "15px", borderBottom: "1px solid #efefef" },
  modalMeta: {
    padding: "12px 15px",
    borderBottom: "1px solid #efefef",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  title: { fontSize: "16px", fontWeight: "600", color: "#262626" },
  description: { fontSize: "14px", color: "#262626" },
  tags: { display: "flex", flexWrap: "wrap", gap: "8px" },
  tag: { fontSize: "13px", color: "#00376b" },
  commentList: { flex: 1, padding: "15px", overflowY: "auto" },
  commentItem: { marginBottom: "10px", fontSize: "14px" },
  modalActions: { padding: "15px", borderTop: "1px solid #efefef" },
  commentForm: {
    display: "flex",
    borderTop: "1px solid #efefef",
    padding: "10px",
  },
  commentInput: { flex: 1, border: "none", outline: "none" },
  postBtn: {
    background: "none",
    border: "none",
    color: "#0095f6",
    fontWeight: "bold",
    cursor: "pointer",
  },
};

export default Post;
