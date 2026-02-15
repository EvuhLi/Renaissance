import React from "react";
import { GiShirtButton } from "react-icons/gi";

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
            onClick={() => setSelectedPost(post)}
          >
            <img
              src={post.url}
              alt="artwork"
              style={{
                ...styles.artwork,
                filter: isProtected ? "blur(30px)" : "none",
              }}
            />

            <div
              onContextMenu={(e) => {
                e.preventDefault();
                alert("Image export restricted.");
              }}
              className="gridOverlay"
              style={styles.gridOverlay}
            />
          </div>
        ))}
      </div>

      {selectedPost && (
        <div style={styles.modalOverlay} onClick={() => setSelectedPost(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalImageSide}>
              <img
                src={selectedPost.url}
                alt="art"
                style={{
                  ...styles.modalImg,
                  filter: isProtected ? "blur(30px)" : "none",
                }}
              />
              <div
                onContextMenu={(e) => e.preventDefault()}
                style={styles.ghostLayer}
              />
            </div>

            <div style={styles.modalInfoSide}>
              <div style={styles.modalHeader}>
                <strong>{user.username}</strong>
              </div>
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
                {(selectedPost.comments || []).map((c) => (
                  <div key={c.id} style={styles.commentItem}>
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
    zIndex: 10,
    backgroundImage:
      'url("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")',
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
