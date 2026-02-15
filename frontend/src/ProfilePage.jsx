import React, { useState, useRef, useEffect } from "react";
import Post from "./Post";

const BACKEND_URL = "http://localhost:3001";

// ==========================================
// 1. PROTECTION UTILITIES (Invisible Cloak)
// ==========================================
const applyCloak = (ctx, width, height) => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const jitterR = (Math.random() > 0.5 ? 1 : -1) * 2;
    const jitterG = (Math.random() > 0.5 ? 1 : -1) * 2;
    const jitterB = (Math.random() > 0.5 ? 1 : -1) * 2;
    data[i] = Math.min(255, Math.max(0, data[i] + jitterR));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + jitterG));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + jitterB));
  }
  ctx.putImageData(imageData, 0, 0);
};

const checkIsAI = async (file) => {
  try {
    const base64Image = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(file);
    });
    const response = await fetch(`${BACKEND_URL}/api/check-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: base64Image }),
    });
    const result = await response.json();
    const aiScore =
      result.find((r) => r.label.toLowerCase() === "artificial")?.score || 0;
    return aiScore > 0.7;
  } catch (error) {
    console.error("Shield Error:", error);
    return false;
  }
};

// ==========================================
// 2. MAIN COMPONENT
// ==========================================
const ProfilePage = () => {
  const fileInputRef = useRef(null);
  const [isProtected, setIsProtected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [likedPosts, setLikedPosts] = useState({}); // Stores { postId: true/false }
  const [isNewPostOpen, setIsNewPostOpen] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newImageFile, setNewImageFile] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const toggleButton = async (postId) => {
    const wasLiked = !!likedPosts[postId];
    const delta = wasLiked ? -1 : 1;

    setLikedPosts((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));

    setPosts((prev) =>
      prev.map((post) =>
        (post._id || post.id) === postId
          ? { ...post, likes: (post.likes ?? 0) + delta }
          : post
      )
    );

    setSelectedPost((prev) =>
      prev && (prev._id || prev.id) === postId
        ? { ...prev, likes: (prev.likes ?? 0) + delta }
        : prev
    );

    try {
      const response = await fetch(`${BACKEND_URL}/api/posts/${postId}/like`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });

      if (!response.ok) throw new Error("Failed to update like");
      const updatedPost = await response.json();

      setPosts((prev) =>
        prev.map((post) =>
          (post._id || post.id) === postId ? updatedPost : post
        )
      );
      setSelectedPost((prev) =>
        prev && (prev._id || prev.id) === postId ? updatedPost : prev
      );
    } catch (error) {
      console.error("Update Like Error:", error);
      const rollback = -delta;
      setLikedPosts((prev) => ({
        ...prev,
        [postId]: wasLiked,
      }));
      setPosts((prev) =>
        prev.map((post) =>
          (post._id || post.id) === postId
            ? { ...post, likes: (post.likes ?? 0) + rollback }
            : post
        )
      );
      setSelectedPost((prev) =>
        prev && (prev._id || prev.id) === postId
          ? { ...prev, likes: (prev.likes ?? 0) + rollback }
          : prev
      );
    }
  };
  //   const [newComment, setNewComment] = useState("");

  const [user] = useState({
    username: "Loom_Artist_01",
    profilePic:
      "/assets/handprint-primitive-man-cave-black-600nw-2503552171.png",
    followers: "67",
    following: "67",
    bio: "biobiobiobio",
  });

  const [posts, setPosts] = useState([]);

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/posts`);
        if (!response.ok) throw new Error("Failed to load posts");
        const data = await response.json();
        setPosts(data);
      } catch (error) {
        console.error("Load Posts Error:", error);
      }
    };

    loadPosts();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) setIsProtected(true);
      if (e.key === "PrintScreen") {
        setIsProtected(true);
        setTimeout(() => setIsProtected(false), 1000);
      }
    };
    const handleKeyUp = (e) => {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) setIsProtected(false);
    };
    const handleBlur = () => setIsProtected(true);
    const handleFocus = () => setIsProtected(false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // --- UPLOAD & CLOAK FLOW ---
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNewImageFile(file);
  };

  const handleCreatePost = async () => {
    if (!newImageFile) return;

    setIsScanning(true);
    const isAI = await checkIsAI(newImageFile);

    if (isAI) {
      alert("BLOCKED: AI Generation detected.");
      setIsScanning(false);
      return;
    }

    const img = new Image();
    img.src = URL.createObjectURL(newImageFile);
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      applyCloak(ctx, img.width, img.height); // Apply invisible protection

      const cloakedUrl = canvas.toDataURL("image/jpeg", 0.9);
      const tagsArray = newTags
        .split(/[,#]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const payload = {
        user: user.username,
        likes: 0,
        comments: [],
        url: cloakedUrl,
        title: newTitle.trim() || undefined,
        description: newDescription.trim() || undefined,
        tags: tagsArray,
        date: new Date().toISOString(),
      };

      try {
        const response = await fetch(`${BACKEND_URL}/api/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Failed to save post: ${response.status} ${response.statusText} ${errorText}`
          );
        }
        const savedPost = await response.json();
        setPosts((prev) => [savedPost, ...prev]);
        setIsNewPostOpen(false);
        setNewDescription("");
        setNewTags("");
        setNewImageFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        console.error("Save Post Error:", error);
      } finally {
        setIsScanning(false);
      }
    };
  };

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.profilePicBox}>
          <img src={user.profilePic} alt="profile" style={styles.profilePic} />
        </div>
        <div style={styles.statsContainer}>
          <div style={styles.usernameRow}>
            <h2 style={styles.username}>{user.username}</h2>
            <button
              style={styles.uploadBtn}
              onClick={() => setIsNewPostOpen(true)}
              disabled={isScanning}
            >
              {"New Post"}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
              accept="image/*"
            />
          </div>
          <div style={styles.statsRow}>
            <span>
              <strong>{posts.length}</strong> drawings
            </span>
            <span>
              <strong>{user.followers}</strong> followers
            </span>
            <span>
              <strong>{user.following}</strong> following
            </span>
          </div>
          <p style={styles.bio}>{user.bio}</p>
        </div>
      </header>

      <hr style={styles.divider} />

      <Post
        posts={posts}
        user={user}
        isProtected={isProtected}
        selectedPost={selectedPost}
        setSelectedPost={setSelectedPost}
        likedPosts={likedPosts}
        toggleButton={toggleButton}
      />

      {isNewPostOpen && (
        <div style={styles.newPostOverlay} onClick={() => setIsNewPostOpen(false)}>
          <div style={styles.newPostModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.newPostHeader}>
              <h3 style={styles.newPostTitle}>Create new post</h3>
              <button
                style={styles.newPostClose}
                onClick={() => setIsNewPostOpen(false)}
              >
                ✕
              </button>
            </div>
            <div style={styles.newPostBody}>
              <label style={styles.newPostLabel}>Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={styles.newPostInput}
                placeholder="Give your artwork a title..."
              />

              <label style={styles.newPostLabel}>Description</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                style={styles.newPostTextarea}
                placeholder="Write something about your art..."
                rows={4}
              />

              <label style={styles.newPostLabel}>Tags</label>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                style={styles.newPostInput}
                placeholder="e.g. watercolor, nature, landscape"
              />

              <label style={styles.newPostLabel}>Image</label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                style={styles.newPostFile}
              />
            </div>
            <div style={styles.newPostFooter}>
              <button
                style={styles.newPostPrimary}
                onClick={handleCreatePost}
                disabled={isScanning || !newImageFile}
              >
                {isScanning ? "Scanning..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 3. STYLES (Kept all protection UI)
// ==========================================
const styles = {
  container: {
    maxWidth: "935px",
    margin: "0 auto",
    padding: "40px 20px",
    fontFamily: "sans-serif",
    backgroundColor: "#fff",
  },
  header: { display: "flex", marginBottom: "44px" },
  profilePicBox: { flex: 1, display: "flex", justifyContent: "center" },
  profilePic: {
    width: "150px",
    height: "150px",
    borderRadius: "50%",
    border: "1px solid #dbdbdb",
  },
  statsContainer: { flex: 2 },
  usernameRow: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    marginBottom: "20px",
  },
  username: { fontSize: "28px", fontWeight: "300" },
  uploadBtn: {
    backgroundColor: "#0095f6",
    color: "white",
    border: "none",
    borderRadius: "4px",
    padding: "5px 15px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  statsRow: { display: "flex", gap: "30px", marginBottom: "20px" },
  bio: { fontWeight: "bold" },
  divider: {
    border: "0",
    borderTop: "1px solid #dbdbdb",
    marginBottom: "20px",
  },
  newPostOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.6)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1200,
  },
  newPostModal: {
    width: "90%",
    maxWidth: "520px",
    backgroundColor: "#fff",
    borderRadius: "8px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
    overflow: "hidden",
  },
  newPostHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px",
    borderBottom: "1px solid #efefef",
  },
  newPostTitle: { margin: 0, fontSize: "18px" },
  newPostClose: {
    background: "none",
    border: "none",
    fontSize: "18px",
    cursor: "pointer",
  },
  newPostBody: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px",
  },
  newPostLabel: { fontSize: "13px", fontWeight: "600", color: "#555" },
  newPostTextarea: {
    resize: "vertical",
    borderRadius: "6px",
    border: "1px solid #dbdbdb",
    padding: "10px",
    fontFamily: "inherit",
  },
  newPostInput: {
    borderRadius: "6px",
    border: "1px solid #dbdbdb",
    padding: "10px",
    fontFamily: "inherit",
  },
  newPostFile: {
    padding: "6px 0",
  },
  newPostFooter: {
    padding: "16px",
    borderTop: "1px solid #efefef",
    display: "flex",
    justifyContent: "flex-end",
  },
  newPostPrimary: {
    backgroundColor: "#0095f6",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "8px 16px",
    fontWeight: "bold",
    cursor: "pointer",
  },
};

export default ProfilePage;
