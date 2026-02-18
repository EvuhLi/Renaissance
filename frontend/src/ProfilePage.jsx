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
const analyzeImageTags = async (canvas) => {
  try {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];
    const response = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: base64 }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("Tagging proxy unavailable:", error.message);
    return null;
  }
};

const mergeManualTags = (mlTagsRaw, userTagsArray) => {
  const base = mlTagsRaw || {};
  const existingLabels = new Set(
    Object.values(base).flat().map((t) => t.label.toLowerCase())
  );
  const manualTags = userTagsArray
    .filter((label) => !existingLabels.has(label.toLowerCase()))
    .map((label) => ({ label, confidence: 0.75 }));
  return { ...base, manual: manualTags };
};

// ==========================================
// 3. MAIN COMPONENT
// ==========================================
const ProfilePage = () => {
  const { artistId } = useParams();
  const resolvedArtistId = (artistId || "").match(/[a-f0-9]{24}/i)?.[0];
  const fileInputRef = useRef(null);
  
  // Ref to prevent multiple simultaneous clicks on the same post
  const likeLock = useRef({});

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
  const [user, setUser] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [posts, setPosts] = useState([]);

  const defaultUser = {
    username: "Loom_Artist_01",
    profilePic: "/assets/handprint-primitive-man-cave-black-600nw-2503552171.png",
    bio: "",
    followersCount: 0,
    following: [],
  };

  const profileOwner = user || defaultUser;
  const currentUser = viewer || defaultUser; // the logged-in / acting user

  // ─── Updated Toggle Like (Delta logic removed, lock added) ───
  const toggleButton = async (postId) => {
    const pid = normalizeId(postId);
    // If a request for this post is already in flight, block new clicks
    if (!pid) return null;
    if (likeLock.current[pid]) {
      console.debug("toggleButton: already in flight, ignoring", pid);
      return null;
    }
    likeLock.current[pid] = true;

    const username = currentUser?.username;

    try {
      console.debug("toggleButton: sending like toggle", { pid, username });
      const response = await fetch(`${BACKEND_URL}/api/posts/${pid}/like`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      console.debug("toggleButton: response status", response.status);

      if (!response.ok) throw new Error("Failed to update like");
      
      // Server calculates the new state and returns the updated post object
      const updatedPost = await response.json();

      // Normalize server response to avoid downstream rendering issues
      const norm = {
        ...updatedPost,
        _id: String(updatedPost._id),
        artistId: updatedPost.artistId ? String(updatedPost.artistId) : updatedPost.artistId,
        likes: typeof updatedPost.likes === "number" ? updatedPost.likes : Number(updatedPost.likes) || 0,
        mlTags: updatedPost.mlTags || {},
      };

      // Update local state arrays using normalized string ids
      setPosts((prev) =>
        prev.map((p) => (normalizeId(p._id || p.id) === pid ? norm : p))
      );
      
      // Update the modal if it is open
      setSelectedPost((prev) =>
        prev && normalizeId(prev._id || prev.id) === pid ? norm : prev
      );
      
      // Determine if it is liked based on user presence in likedBy array
      const isNowLiked = norm.likedBy?.map(u => u.toLowerCase()).includes(username?.toLowerCase());
      console.debug("toggleButton: updated likedBy", norm.likedBy, "isNowLiked", isNowLiked, "likes", norm.likes);
      setLikedPosts((prev) => ({
        ...prev,
        [pid]: Boolean(isNowLiked),
      }));

      return norm;

    } catch (error) {
      console.error("Update Like Error:", error);
    } finally {
      // Release the lock for this specific post
      delete likeLock.current[pid];
      console.debug("toggleButton: released lock for", pid);
    }
  };

  const normalizeId = (value) => {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "object" && value.$oid) return value.$oid;
    return String(value);
  };

  const currentUserId = normalizeId(currentUser?._id);
  const visiblePosts = posts.filter((post) => {
    const postArtistId = normalizeId(
      post.artistId || (typeof post.user === "object" ? post.user._id : undefined)
    );
    const postUsername = typeof post.user === "object" ? post.user.username : post.user;
    if (resolvedArtistId) return String(postArtistId) === String(resolvedArtistId);
    const profileOwnerId = normalizeId(profileOwner?._id);
    if (profileOwnerId && postArtistId) return String(postArtistId) === String(profileOwnerId);
    if (profileOwner?.username) return postUsername === profileOwner.username;
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
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", () => setIsProtected(true));
    window.addEventListener("focus", () => setIsProtected(false));
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) setNewImageFile(file);
  };

  const handleCreatePost = async () => {
    if (!newImageFile) return;
    setIsScanning(true);
    setScanStatus("Checking for AI generation...");
    
    const isAI = await checkIsAI(newImageFile);
    if (isAI) {
      alert("BLOCKED: AI Generation detected.");
      setIsScanning(false);
      setScanStatus("");
      return;
    }

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

      setScanStatus("Analyzing artwork...");
      const mlTagsRaw = await analyzeImageTags(canvas);
      const userTagsArray = newTags.split(/[,#]/).map((t) => t.trim()).filter(Boolean);
      const mergedMlTags = mergeManualTags(mlTagsRaw, userTagsArray);
      
      const flatTags = [...new Set([...userTagsArray, ...Object.values(mergedMlTags).flat().map(t => t.label)])];

      setScanStatus("Saving post...");
      const payload = {
        user: currentUser.username.toLowerCase(),
        artistId: currentUser._id,
        likes: 0,
        url: canvas.toDataURL("image/jpeg", 0.9),
        title: newTitle.trim() || "Untitled",
        description: newDescription.trim() || "",
        tags: flatTags,
        mlTags: mergedMlTags,
        date: new Date().toISOString(),
      };

      try {
        const response = await fetch(`${BACKEND_URL}/api/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const savedPost = await response.json();
        const saved = { ...savedPost, _id: normalizeId(savedPost._id) };
        setPosts((prev) => [saved, ...prev]);
        setLikedPosts((prev) => ({ ...prev, [normalizeId(savedPost._id)]: false }));
        setIsNewPostOpen(false);
        setNewDescription("");
        setNewTags("");
        setNewTitle("");
        setNewImageFile(null);
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
    setIsCreatingAccount(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newAccountUsername.trim().toLowerCase(),
          bio: newAccountBio.trim(),
          followersCount: Number(newAccountFollowers) || 0
        }),
      });
      const created = await response.json();
      setUser(created);
      setViewer(created);
    } catch (err) {
      setAccountError("Failed to create account.");
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const isOwnProfile = currentUser?.username && profileOwner?.username && (currentUser.username === profileOwner.username);

  const isFollowingProfile = () => {
    try {
      const following = currentUser?.following || [];
      const targetId = normalizeId(profileOwner?._id);
      return following.map(String).includes(String(targetId));
    } catch (e) {
      return false;
    }
  };

  const toggleFollow = async () => {
    if (!currentUser?.username || !profileOwner?.username) return;
    try {
      const resp = await fetch(`${BACKEND_URL}/api/accounts/${encodeURIComponent(profileOwner.username)}/follow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follower: currentUser.username }),
      });
      if (!resp.ok) throw new Error("Follow toggle failed");
      const result = await resp.json();
      // update UI state: profileOwner (target) and viewer (follower)
      if (result.target) setUser(result.target);
      if (result.follower) setViewer(result.follower);
    } catch (err) {
      console.error("Toggle follow failed:", err);
    }
  };

  return (
    <div style={styles.container}>
      {/* Account Section */}
      <section style={styles.accountPanel}>
        <h3 style={styles.accountTitle}>Create Account</h3>
        <form style={styles.accountForm} onSubmit={handleCreateAccount}>
          <input type="text" placeholder="Username" value={newAccountUsername} onChange={(e) => setNewAccountUsername(e.target.value)} style={styles.accountInput} required />
          <input type="text" placeholder="Bio" value={newAccountBio} onChange={(e) => setNewAccountBio(e.target.value)} style={styles.accountInput} />
          <input type="number" placeholder="Followers" value={newAccountFollowers} onChange={(e) => setNewAccountFollowers(e.target.value)} style={styles.accountInput} />
          <button type="submit" style={styles.accountButton}>{isCreatingAccount ? "..." : "Create"}</button>
        </form>
      </section>

      {/* Header Section */}
      <header style={styles.header}>
        <div style={styles.profilePicBox}>
          <img src={profileOwner.profilePic} alt="profile" style={styles.profilePic} />
        </div>
        <div style={styles.statsContainer}>
          <div style={styles.usernameRow}>
            <h2 style={styles.username}>{profileOwner.username}</h2>
            {isOwnProfile ? (
              <button style={styles.uploadBtn} onClick={() => setIsNewPostOpen(true)}>New Post</button>
            ) : (
              <button
                style={{ ...styles.uploadBtn, backgroundColor: isFollowingProfile() ? '#6aa84f' : '#0095f6' }}
                onClick={toggleFollow}
              >
                {isFollowingProfile() ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
          <div style={styles.statsRow}>
            <span><strong>{visiblePosts.length}</strong> drawings</span>
            <span><strong>{profileOwner.followersCount}</strong> followers</span>
          </div>
          <p style={styles.bio}>{profileOwner.bio}</p>
        </div>
      </header>

      <hr style={styles.divider} />

      {/* Post Grid */}
      <Post
        posts={visiblePosts}
        user={currentUser}
        isProtected={isProtected}
        selectedPost={selectedPost}
        setSelectedPost={setSelectedPost}
        likedPosts={likedPosts}
        toggleButton={toggleButton}
        addComment={async (postId, text) => {
          if (!text || !text.trim()) return null;
          const pid = normalizeId(postId);
          try {
            const response = await fetch(`${BACKEND_URL}/api/posts/${pid}/comment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: currentUser?.username, text }),
            });
            if (!response.ok) throw new Error("Failed to add comment");
            const updatedPost = await response.json();
            // Update posts list and modal
            setPosts((prev) => prev.map((p) => (normalizeId(p._id || p.id) === pid ? updatedPost : p)));
            setSelectedPost((prev) => (prev && normalizeId(prev._id || prev.id) === pid ? updatedPost : prev));
            return updatedPost;
          } catch (err) {
            console.error("Add comment failed:", err);
            return null;
          }
        }}
      />

      {/* Upload Modal */}
      {isNewPostOpen && (
        <div style={styles.newPostOverlay} onClick={() => setIsNewPostOpen(false)}>
          <div style={styles.newPostModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.newPostHeader}>
              <h3>Create new post</h3>
              <button onClick={() => setIsNewPostOpen(false)}>✕</button>
            </div>
            <div style={styles.newPostBody}>
              <input type="text" placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={styles.newPostInput} />
              <textarea placeholder="Description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} style={styles.newPostTextarea} />
              <input type="text" placeholder="Tags" value={newTags} onChange={(e) => setNewTags(e.target.value)} style={styles.newPostInput} />
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" />
            </div>
            <div style={styles.newPostFooter}>
              {scanStatus && <span style={styles.scanStatus}>{scanStatus}</span>}
              <button style={styles.newPostPrimary} onClick={handleCreatePost} disabled={isScanning || !newImageFile}>
                {isScanning ? "Processing..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: { maxWidth: "935px", margin: "0 auto", padding: "40px 20px", fontFamily: "sans-serif" },
  accountPanel: { border: "1px solid #dbdbdb", borderRadius: "8px", padding: "16px", marginBottom: "24px", backgroundColor: "#fafafa" },
  accountTitle: { margin: "0 0 12px", fontSize: "16px" },
  accountForm: { display: "flex", gap: "10px", flexWrap: "wrap" },
  accountInput: { borderRadius: "6px", border: "1px solid #dbdbdb", padding: "8px" },
  accountButton: { backgroundColor: "#111", color: "white", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer" },
  header: { display: "flex", marginBottom: "44px" },
  profilePicBox: { flex: 1, display: "flex", justifyContent: "center" },
  profilePic: { width: "150px", height: "150px", borderRadius: "50%", border: "1px solid #dbdbdb" },
  statsContainer: { flex: 2 },
  usernameRow: { display: "flex", alignItems: "center", gap: "20px", marginBottom: "20px" },
  username: { fontSize: "28px", fontWeight: "300" },
  uploadBtn: { backgroundColor: "#0095f6", color: "white", border: "none", borderRadius: "4px", padding: "5px 15px", fontWeight: "bold", cursor: "pointer" },
  statsRow: { display: "flex", gap: "30px", marginBottom: "20px" },
  bio: { fontWeight: "bold" },
  divider: { border: "0", borderTop: "1px solid #dbdbdb", marginBottom: "20px" },
  newPostOverlay: { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1200 },
  newPostModal: { width: "90%", maxWidth: "520px", backgroundColor: "#fff", borderRadius: "8px", overflow: "hidden" },
  newPostHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", borderBottom: "1px solid #efefef" },
  newPostBody: { display: "flex", flexDirection: "column", gap: "10px", padding: "16px" },
  newPostInput: { borderRadius: "6px", border: "1px solid #dbdbdb", padding: "10px" },
  newPostTextarea: { borderRadius: "6px", border: "1px solid #dbdbdb", padding: "10px", resize: "vertical" },
  newPostFooter: { padding: "16px", borderTop: "1px solid #efefef", display: "flex", justifyContent: "flex-end" },
  newPostPrimary: { backgroundColor: "#0095f6", color: "white", border: "none", borderRadius: "6px", padding: "8px 16px", fontWeight: "bold", cursor: "pointer" },
  scanStatus: { fontSize: "13px", color: "#555", fontStyle: "italic", flex: 1 },
};

export default ProfilePage;