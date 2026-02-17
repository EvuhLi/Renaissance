import React, { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
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
// 2. ML TAGGING UTILITY
// ==========================================

/**
 * Sends the cloaked canvas to the Express backend proxy at /api/analyze,
 * which forwards it server-side to the Python tagging service on port 8001.
 * This avoids the browser making a direct cross-origin call to localhost:8001.
 *
 * The canvas is serialized as a base64 string — same pattern as /api/check-ai —
 * so no new serialization strategy is needed on either end.
 */
const analyzeImageTags = async (canvas) => {
  try {
    // Extract base64 from the cloaked canvas (strip the data URL prefix)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];

    const response = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: base64 }),
    });

    if (!response.ok) {
      console.warn(`Tagging service returned ${response.status} — skipping ML tags.`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn("Tagging proxy unavailable — skipping ML tags:", error.message);
    return null;
  }
};

/**
 * Merges manual user tags (given a fixed confidence of 0.75) into the
 * structured mlTags object under a dedicated "manual" category.
 * Manual tags are de-duplicated against auto-generated labels.
 */
const mergeManualTags = (mlTagsRaw, userTagsArray) => {
  const base = mlTagsRaw || {};

  const existingLabels = new Set(
    Object.values(base)
      .flat()
      .map((t) => t.label.toLowerCase())
  );

  const manualTags = userTagsArray
    .filter((label) => !existingLabels.has(label.toLowerCase()))
    .map((label) => ({ label, confidence: 0.75 }));

  return {
    ...base,
    manual: manualTags,
  };
};

// ==========================================
// 3. MAIN COMPONENT
// ==========================================
const ProfilePage = () => {
  const { artistId } = useParams();
  const resolvedArtistId = (artistId || "").match(/[a-f0-9]{24}/i)?.[0];
  const fileInputRef = useRef(null);
  const [isProtected, setIsProtected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [selectedPost, setSelectedPost] = useState(null);
  const [likedPosts, setLikedPosts] = useState({});
  const [isNewPostOpen, setIsNewPostOpen] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newImageFile, setNewImageFile] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAccountUsername, setNewAccountUsername] = useState("");
  const [newAccountBio, setNewAccountBio] = useState("");
  const [newAccountFollowers, setNewAccountFollowers] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [profileError, setProfileError] = useState("");

  const toggleButton = async (postId) => {
    const wasLiked = !!likedPosts[postId];
    const delta = wasLiked ? -1 : 1;

    setLikedPosts((prev) => ({ ...prev, [postId]: !prev[postId] }));
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
      setLikedPosts((prev) => ({ ...prev, [postId]: wasLiked }));
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

  const defaultUser = {
    username: "Loom_Artist_01",
    profilePic:
      "/assets/handprint-primitive-man-cave-black-600nw-2503552171.png",
    bio: "",
    followersCount: 0,
    following: [],
  };

  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);

  const normalizeId = (value) => {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "object" && value.$oid) return value.$oid;
    return String(value);
  };

  const currentUser = user || defaultUser;
  const currentUserId = normalizeId(currentUser?._id);
  const visiblePosts = posts.filter((post) => {
    const postArtistId = normalizeId(
      post.artistId || (typeof post.user === "object" ? post.user._id : undefined)
    );
    const postUsername =
      typeof post.user === "object" ? post.user.username : post.user;
    if (resolvedArtistId) return String(postArtistId) === String(resolvedArtistId);
    if (currentUserId && postArtistId) return String(postArtistId) === String(currentUserId);
    if (currentUser?.username) return postUsername === currentUser.username;
    return true;
  });

  useEffect(() => {
    setUser(null);
    setProfileError("");

    const loadAccount = async () => {
      try {
        const accountUrl = resolvedArtistId
          ? `${BACKEND_URL}/api/accounts/id/${encodeURIComponent(resolvedArtistId)}`
          : `${BACKEND_URL}/api/accounts/${encodeURIComponent(defaultUser.username)}`;
        const response = await fetch(accountUrl);
        if (!response.ok) throw new Error("Failed to load account");
        const data = await response.json();
        setUser(data);
      } catch (error) {
        console.error("Load Account Error:", error);
        setProfileError("Could not load artist profile.");
      }
    };

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

    loadAccount();
    loadPosts();
  }, [artistId, resolvedArtistId]);

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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNewImageFile(file);
  };

  // ==========================================
  // UPLOAD FLOW: AI check → Cloak → ML Tag → Merge → Save
  // ==========================================
  const handleCreatePost = async () => {
    if (!newImageFile) return;

    setIsScanning(true);

    // Step 1: AI detection
    setScanStatus("Checking for AI generation...");
    const isAI = await checkIsAI(newImageFile);
    if (isAI) {
      alert("BLOCKED: AI Generation detected.");
      setIsScanning(false);
      setScanStatus("");
      return;
    }

    // Step 2: Draw + cloak
    setScanStatus("Applying protection layer...");
    const img = new Image();
    img.src = URL.createObjectURL(newImageFile);

    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      applyCloak(ctx, img.width, img.height);

      // Step 3: ML tagging — routed through the Express backend proxy
      // so the browser never makes a direct call to localhost:8001
      setScanStatus("Analyzing artwork...");
      const mlTagsRaw = await analyzeImageTags(canvas);

      // Step 4: Parse + merge manual tags into the structured mlTags object
      const userTagsArray = newTags
        .split(/[,#]/)
        .map((t) => t.trim())
        .filter(Boolean);

      const mergedMlTags = mergeManualTags(mlTagsRaw, userTagsArray);

      // Step 5: Build flat tags array for legacy compatibility
      const flatTags = [
        ...userTagsArray,
        ...Object.entries(mergedMlTags)
          .filter(([cat]) => cat !== "manual")
          .flatMap(([, tags]) => tags.map((t) => t.label)),
      ];
      const dedupedFlatTags = [...new Set(flatTags)];

      // Step 6: Save post
      setScanStatus("Saving post...");
      const cloakedUrl = canvas.toDataURL("image/jpeg", 0.9);
      const currentUser = user || defaultUser;

      const payload = {
        user: currentUser.username,
        artistId: currentUser._id,
        likes: 0,
        comments: [],
        url: cloakedUrl,
        title: newTitle.trim() || undefined,
        description: newDescription.trim() || undefined,
        tags: dedupedFlatTags,
        mlTags: mergedMlTags,
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
          throw new Error(`Failed to save post: ${response.status} ${errorText}`);
        }

        const savedPost = await response.json();
        setPosts((prev) => [savedPost, ...prev]);
        setIsNewPostOpen(false);
        setNewDescription("");
        setNewTags("");
        setNewTitle("");
        setNewImageFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        console.error("Save Post Error:", error);
      } finally {
        setIsScanning(false);
        setScanStatus("");
      }
    };
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!newAccountUsername.trim()) return;
    setIsCreatingAccount(true);
    setAccountError("");
    try {
      const payload = {
        username: newAccountUsername.trim(),
        bio: newAccountBio.trim() || undefined,
        followersCount:
          newAccountFollowers.trim() === "" ? undefined : Number(newAccountFollowers),
      };
      const response = await fetch(`${BACKEND_URL}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create account: ${response.status} ${errorText}`);
      }
      const created = await response.json();
      setUser(created);
      setNewAccountUsername("");
      setNewAccountBio("");
      setNewAccountFollowers("");
    } catch (error) {
      console.error("Create Account Error:", error);
      setAccountError("Could not create account.");
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const postButtonLabel = () => {
    if (!isScanning) return "Post";
    if (scanStatus) return scanStatus;
    return "Processing...";
  };

  return (
    <div style={styles.container}>
      <section style={styles.accountPanel}>
        <h3 style={styles.accountTitle}>Create Account</h3>
        <form style={styles.accountForm} onSubmit={handleCreateAccount}>
          <input
            type="text"
            placeholder="Username"
            value={newAccountUsername}
            onChange={(e) => setNewAccountUsername(e.target.value)}
            style={styles.accountInput}
            required
          />
          <input
            type="text"
            placeholder="Bio (optional)"
            value={newAccountBio}
            onChange={(e) => setNewAccountBio(e.target.value)}
            style={styles.accountInput}
          />
          <input
            type="number"
            placeholder="Followers count (optional)"
            value={newAccountFollowers}
            onChange={(e) => setNewAccountFollowers(e.target.value)}
            style={styles.accountInput}
            min="0"
          />
          <div style={styles.accountActions}>
            <button type="submit" style={styles.accountButton} disabled={isCreatingAccount}>
              {isCreatingAccount ? "Creating..." : "Create"}
            </button>
            {accountError && <span style={styles.accountError}>{accountError}</span>}
          </div>
        </form>
      </section>

      <header style={styles.header}>
        <div style={styles.profilePicBox}>
          <img
            src={(user && user.profilePic) || defaultUser.profilePic}
            alt="profile"
            style={styles.profilePic}
          />
        </div>
        <div style={styles.statsContainer}>
          <div style={styles.usernameRow}>
            <h2 style={styles.username}>
              {resolvedArtistId && !user && !profileError
                ? "Loading..."
                : (user && user.username) || defaultUser.username}
            </h2>
            {profileError && <span style={styles.accountError}>{profileError}</span>}
            <button
              style={styles.uploadBtn}
              onClick={() => setIsNewPostOpen(true)}
              disabled={isScanning}
            >
              New Post
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
            <span><strong>{visiblePosts.length}</strong> drawings</span>
            <span><strong>{user?.followersCount ?? 0}</strong> followers</span>
            <span><strong>{(user?.following || []).length}</strong> following</span>
          </div>
          <p style={styles.bio}>{user?.bio || defaultUser.bio}</p>
        </div>
      </header>

      <hr style={styles.divider} />

      <Post
        posts={visiblePosts}
        user={currentUser}
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
              <button style={styles.newPostClose} onClick={() => setIsNewPostOpen(false)}>
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
              {newImageFile && (
                <p style={styles.mlNote}>
                  🎨 Artwork tags will be auto-generated by Loom after posting.
                </p>
              )}
            </div>
            <div style={styles.newPostFooter}>
              {isScanning && scanStatus && (
                <span style={styles.scanStatus}>{scanStatus}</span>
              )}
              <button
                style={{
                  ...styles.newPostPrimary,
                  opacity: isScanning || !newImageFile ? 0.6 : 1,
                  cursor: isScanning || !newImageFile ? "not-allowed" : "pointer",
                }}
                onClick={handleCreatePost}
                disabled={isScanning || !newImageFile}
              >
                {postButtonLabel()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    maxWidth: "935px",
    margin: "0 auto",
    padding: "40px 20px",
    fontFamily: "sans-serif",
    backgroundColor: "#fff",
  },
  accountPanel: {
    border: "1px solid #dbdbdb",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "24px",
    backgroundColor: "#fafafa",
  },
  accountTitle: { margin: "0 0 12px", fontSize: "16px" },
  accountForm: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "10px",
  },
  accountInput: {
    borderRadius: "6px",
    border: "1px solid #dbdbdb",
    padding: "10px",
    fontFamily: "inherit",
  },
  accountActions: { display: "flex", alignItems: "center", gap: "12px" },
  accountButton: {
    backgroundColor: "#111",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "8px 16px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  accountError: { color: "#b42318", fontSize: "12px" },
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
  divider: { border: "0", borderTop: "1px solid #dbdbdb", marginBottom: "20px" },
  newPostOverlay: {
    position: "fixed",
    top: 0, left: 0,
    width: "100%", height: "100%",
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
  newPostClose: { background: "none", border: "none", fontSize: "18px", cursor: "pointer" },
  newPostBody: { display: "flex", flexDirection: "column", gap: "10px", padding: "16px" },
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
  newPostFile: { padding: "6px 0" },
  newPostFooter: {
    padding: "16px",
    borderTop: "1px solid #efefef",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "12px",
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
  mlNote: { fontSize: "12px", color: "#888", margin: "4px 0 0", fontStyle: "italic" },
  scanStatus: { fontSize: "13px", color: "#555", fontStyle: "italic", flex: 1 },
};

export default ProfilePage;