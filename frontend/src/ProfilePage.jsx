import React, { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import Post from "./Post";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

// ==========================================
// 1. PROTECTION UTILITIES
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
    if (!response.ok) return false;
    const result = await response.json().catch(() => null);
    const items = Array.isArray(result)
      ? result
      : Array.isArray(result?.result)
      ? result.result
      : [];
    const aiScore =
      items.find((r) => String(r?.label || "").toLowerCase() === "artificial")?.score || 0;
    return aiScore > 0.7;
  } catch (error) {
    console.warn("Shield check unavailable, continuing:", error?.message || error);
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

const fitSize = (width, height, maxSide) => {
  const maxDim = Math.max(width, height);
  if (!maxDim || maxDim <= maxSide) return { width, height };
  const scale = maxSide / maxDim;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

// ==========================================
// 3. MAIN COMPONENT
// ==========================================
const ProfilePage = () => {
  const { artistId } = useParams();
  const resolvedArtistId = (artistId || "").match(/[a-f0-9]{24}/i)?.[0];
  const storedUsername =
    typeof window !== "undefined"
      ? (localStorage.getItem("username") || "").trim().toLowerCase()
      : "";
  const storedAccountId =
    typeof window !== "undefined"
      ? (localStorage.getItem("accountId") || "").match(/[a-f0-9]{24}/i)?.[0]
      : undefined;
  const activeArtistId = resolvedArtistId || storedAccountId;

  // REFS
  const fileInputRef = useRef(null);
  const processInputRef = useRef(null);
  const profileInputRef = useRef(null);
  const postsReqSeqRef = useRef(0);

  // STATE
  
  // Ref to prevent multiple simultaneous clicks on the same post
  const likeLock = useRef({});

  const [isProtected, setIsProtected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [selectedPost, setSelectedPost] = useState(null);
  const [likedPosts, setLikedPosts] = useState({});
  const [isNewPostOpen, setIsNewPostOpen] = useState(false);

  // PROFILE UPLOAD STATE
  const [isProfileUploadOpen, setIsProfileUploadOpen] = useState(false);
  const [newProfilePicFile, setNewProfilePicFile] = useState(null);

  // Form States
  const [newDescription, setNewDescription] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newImageFile, setNewImageFile] = useState(null);
  const [newProcessFiles, setNewProcessFiles] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newAccountUsername, setNewAccountUsername] = useState("");
  const [newAccountBio, setNewAccountBio] = useState("");
  const [newAccountFollowers, setNewAccountFollowers] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [accountError, setAccountError] = useState("");
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const [user, setUser] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isPostsLoading, setIsPostsLoading] = useState(true);

  const defaultUser = {
    username: storedUsername || "loom_artist_01",
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

  const visiblePosts = posts.filter((post) => {
    const postArtistId = normalizeId(
      post.artistId || (typeof post.user === "object" ? post.user._id : undefined)
    );
    const postUsername = String(
      typeof post.user === "object" ? post.user.username : post.user || ""
    ).toLowerCase();
    
    if (resolvedArtistId) {
      const byId = String(postArtistId) === String(resolvedArtistId);
      const ownerUsername = String(user?.username || "").toLowerCase();
      const byUsername = Boolean(ownerUsername && postUsername === ownerUsername);
      return byId || byUsername;
    }
    
    const profileOwnerId = normalizeId(profileOwner?._id);
    if (profileOwnerId && postArtistId) {
      const byId = String(postArtistId) === String(profileOwnerId);
      const ownerUsername = String(profileOwner?.username || "").toLowerCase();
      const byUsername = Boolean(ownerUsername && postUsername === ownerUsername);
      return byId || byUsername;
    }
    
    if (profileOwner?.username) {
      const profileOwnerUsername = String(profileOwner.username).toLowerCase();
      return postUsername === profileOwnerUsername;
    }
    
    return true;
  });
  
  useEffect(() => {
    setUser(null);
    setProfileError("");
    setIsPostsLoading(true);

    const loadAccountAndPosts = async () => {
      try {
        // PARALLEL FETCH: Fetch account and viewer in parallel to reduce waterfall latency
        const accountUrl = activeArtistId
          ? `${BACKEND_URL}/api/accounts/id/${encodeURIComponent(activeArtistId)}`
          : `${BACKEND_URL}/api/accounts/${encodeURIComponent(defaultUser.username)}`;
        
        const viewerFetchPromise = viewer
          ? Promise.resolve(null) // Already have viewer, skip fetch
          : fetch(`${BACKEND_URL}/api/accounts/${encodeURIComponent(defaultUser.username)}`)
              .then((res) => res.ok ? res.json() : null)
              .catch((err) => {
                console.warn("Could not load default viewer account:", err);
                return null;
              });

        // Fetch both account and viewer requests in parallel
        const [accountRes, viewerData] = await Promise.all([
          fetch(accountUrl),
          viewerFetchPromise,
        ]);

        let loadedUser = null;
        if (accountRes.ok) {
          loadedUser = await accountRes.json();
          setUser(loadedUser);
        } else {
          setProfileError("Could not load artist profile.");
        }

        if (viewerData) {
          setViewer(viewerData);
          console.log("Loaded default viewer account:", viewerData);
        }

        const targetArtistId = normalizeId(loadedUser?._id || activeArtistId);
        const targetUsername = String(
          loadedUser?.username || defaultUser.username || ""
        )
          .trim()
          .toLowerCase();

        const params = new URLSearchParams();
        if (targetArtistId) params.set("artistId", String(targetArtistId));
        if (targetUsername) params.set("username", targetUsername);
        params.set("limit", "36");

        const reqSeq = ++postsReqSeqRef.current;
        const postsUrl = `${BACKEND_URL}/api/posts${params.toString() ? `?${params}` : ""}`;
        const postsRes = await fetch(postsUrl);
        if (!postsRes.ok) {
          console.error("Failed to fetch posts:", postsRes.status, postsRes.statusText);
          if (reqSeq === postsReqSeqRef.current) setIsPostsLoading(false);
          return;
        }
        const postsData = await postsRes.json();
        if (reqSeq !== postsReqSeqRef.current) return;
        setPosts(Array.isArray(postsData) ? postsData : []);
        setIsPostsLoading(false);
      } catch (e) {
        console.error(e);
        setProfileError("Could not load artist profile.");
        setIsPostsLoading(false);
      }
    };

    loadAccountAndPosts();
  }, [artistId, resolvedArtistId, activeArtistId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) setIsProtected(true);
    };
    const handleKeyUp = () => {
      setIsProtected(false);
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

  // --- HANDLERS FOR POSTS ---
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) setNewImageFile(file);
  };

  const handleProcessFilesChange = (e) => {
    const files = Array.from(e.target.files || []);
    setNewProcessFiles((prev) => [...prev, ...files]);
  };

  const handleRemoveProcessFile = (index) => {
    setNewProcessFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearProcessFiles = () => {
    setNewProcessFiles([]);
  };

  // --- HANDLERS FOR PROFILE PIC ---
  const handleProfileFileChange = (e) => {
    const file = e.target.files[0];
    if (file) setNewProfilePicFile(file);
  };

  const handleSaveProfilePic = async () => {
    if (!isOwnProfile) {
      alert("You can only change your own profile picture.");
      return;
    }
    if (!newProfilePicFile) return;
    if (!profileOwnerId || !currentUserId) {
      alert("Could not verify account ownership.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64String = reader.result;
        const response = await fetch(
          `${BACKEND_URL}/api/accounts/${encodeURIComponent(profileOwnerId)}/profile-pic`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              actorAccountId: currentUserId,
              profilePic: base64String,
            }),
          }
        );
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to save profile picture");
        }

        const updated = await response.json();
        setUser(updated);
        setViewer((prev) =>
          normalizeId(prev?._id) === normalizeId(updated?._id) ? updated : prev
        );
        setIsProfileUploadOpen(false);
        setNewProfilePicFile(null);
      } catch (err) {
        console.error("Save profile picture failed:", err);
        alert("Failed to save profile picture.");
      }
    };
    reader.readAsDataURL(newProfilePicFile);
  };

  const handleCreatePost = async () => {
    if (!isOwnProfile) {
      alert("You can only create posts on your own profile.");
      return;
    }
    const filesToProcess = [newImageFile, ...newProcessFiles].filter(Boolean);
    if (!filesToProcess.length) return;
    const normalizedCurrentUsername = String(
      currentUser?.username || defaultUser.username
    ).toLowerCase();

    const cloakFileToDataUrl = (file, opts = {}) =>
      new Promise((resolve, reject) => {
        const { maxSide = 1400, quality = 0.82 } = opts;
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            const sized = fitSize(img.width, img.height, maxSide);
            canvas.width = sized.width;
            canvas.height = sized.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, sized.width, sized.height);
            applyCloak(ctx, sized.width, sized.height);
            URL.revokeObjectURL(objectUrl);
            resolve(canvas.toDataURL("image/jpeg", quality));
          } catch (err) {
            URL.revokeObjectURL(objectUrl);
            reject(err);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Image failed to load"));
        };
        img.src = objectUrl;
      });

    setIsScanning(true);
    try {
      const cloakedSlides = [];
      let listPreviewUrl = "";
      for (let i = 0; i < filesToProcess.length; i += 1) {
        setScanStatus(`Checking AI (${i + 1}/${filesToProcess.length})...`);
        const isAI = await checkIsAI(filesToProcess[i]);
        if (isAI) {
          alert(`BLOCKED: AI Generation detected in slide ${i + 1}.`);
          return;
        }
        setScanStatus(`Applying protection (${i + 1}/${filesToProcess.length})...`);
        const isCover = i === 0;
        const cloaked = await cloakFileToDataUrl(
          filesToProcess[i],
          isCover
            ? { maxSide: 1400, quality: 0.82 }
            : { maxSide: 1080, quality: 0.76 }
        );
        cloakedSlides.push(cloaked);
        if (isCover) {
          listPreviewUrl = await cloakFileToDataUrl(filesToProcess[i], {
            maxSide: 720,
            quality: 0.68,
          });
        }
      }

      const userTagsArray = newTags
        .split(/[,#]/)
        .map((t) => t.trim())
        .filter(Boolean);

      let mergedMlTags = { manual: userTagsArray.map((label) => ({ label, confidence: 0.75 })) };
      let flatTags = [...new Set(userTagsArray)];

      setScanStatus("Analyzing artwork...");
      const canvas = document.createElement("canvas");
      const previewImg = new Image();
      await new Promise((resolve, reject) => {
        previewImg.onload = resolve;
        previewImg.onerror = reject;
        previewImg.src = cloakedSlides[0];
      });
      canvas.width = previewImg.width;
      canvas.height = previewImg.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(previewImg, 0, 0);

      const mlTagsRaw = await analyzeImageTags(canvas);
      if (!mlTagsRaw) {
        console.warn("ML tagging failed, continuing without ML tags");
      }
      mergedMlTags = mergeManualTags(mlTagsRaw, userTagsArray);
      flatTags = [
        ...new Set([
          ...userTagsArray,
          ...Object.values(mergedMlTags)
            .flat()
            .map((t) => t.label),
        ]),
      ];

      setScanStatus("Saving post...");
      const payload = {
        user: normalizedCurrentUsername,
        artistId: normalizeId(currentUser?._id) || undefined,
        likes: 0,
        comments: [],
        url: cloakedSlides[0],
        previewUrl: listPreviewUrl || cloakedSlides[0],
        processSlides: cloakedSlides.slice(1),
        title: newTitle.trim(),
        description: newDescription.trim(),
        tags: flatTags,
        mlTags: mergedMlTags,
        date: new Date().toISOString(),
      };

      const response = await fetch(`${BACKEND_URL}/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Post creation failed:", errorData);
        alert(`Failed to create post: ${errorData.message || response.statusText}`);
        return;
      }

      const savedPost = await response.json();
      const saved = { ...savedPost, _id: normalizeId(savedPost._id) };
      setPosts((prev) => [saved, ...prev]);
      setLikedPosts((prev) => ({ ...prev, [normalizeId(savedPost._id)]: false }));
      setIsNewPostOpen(false);
      setNewDescription("");
      setNewTags("");
      setNewTitle("");
      setNewImageFile(null);
      setNewProcessFiles([]);
    } catch (error) {
      console.error("Create Post Error:", error);
      alert("Error creating post. Check console for details.");
    } finally {
      setIsScanning(false);
      setScanStatus("");
    }
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
      console.error("Create account failed:", err);
      setAccountError("Failed to create account.");
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const currentUserId = normalizeId(currentUser?._id);
  const profileOwnerId = normalizeId(profileOwner?._id);
  const currentUsername = String(currentUser?.username || "").toLowerCase();
  const profileOwnerUsername = String(profileOwner?.username || "").toLowerCase();

  const isOwnProfile = resolvedArtistId
    ? Boolean(currentUserId && String(currentUserId) === String(resolvedArtistId))
    : Boolean(
        (currentUserId && profileOwnerId && String(currentUserId) === String(profileOwnerId)) ||
          (currentUsername && profileOwnerUsername && currentUsername === profileOwnerUsername)
      );

  const isFollowingProfile = Boolean(
    !isOwnProfile &&
      profileOwnerId &&
      Array.isArray(currentUser?.following) &&
      currentUser.following.map((id) => String(id)).includes(String(profileOwnerId))
  );

  const handleFollowToggle = async () => {
    if (isOwnProfile || !profileOwnerUsername || !currentUsername) return;
    try {
      setIsTogglingFollow(true);
      const resp = await fetch(
        `${BACKEND_URL}/api/accounts/${encodeURIComponent(profileOwnerUsername)}/follow`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ follower: currentUsername }),
        }
      );
      if (!resp.ok) throw new Error("Follow toggle failed");
      const result = await resp.json();
      if (result.target) setUser(result.target);
      if (result.follower) setViewer(result.follower);
    } catch (err) {
      console.error("Follow toggle failed:", err);
      alert("Could not update follow state.");
    } finally {
      setIsTogglingFollow(false);
    }
  };

  return (
    <div style={styles.pageBackground}>
      <style>
        {`
            @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Lato:wght@300;400;700&display=swap');

            .gallery-wrapper > .post-grid {
                display: grid !important;
                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                gap: 40px;
                width: 100%;
            }

            .gallery-wrapper img {
                width: 100%; height: auto; display: block;
                transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                cursor: pointer;
                box-shadow: 2px 4px 10px rgba(0,0,0,0.1);
                backface-visibility: hidden;
            }
            .gallery-wrapper img:hover {
                transform: scale(1.05) rotate(-2deg) translateY(-5px);
                box-shadow: 0 20px 40px rgba(0,0,0,0.25);
                z-index: 100; position: relative;
            }

            .profile-hover-container {
                position: relative;
                width: 100%; height: 100%;
                cursor: pointer;
            }
            .plus-overlay {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.3);
                display: flex; justify-content: center; align-items: center;
                opacity: 0;
                transition: opacity 0.3s ease;
                border-radius: 2px;
            }
            .profile-hover-container:hover .plus-overlay {
                opacity: 1;
            }
            .plus-icon {
                font-size: 40px; color: white;
                font-weight: bold;
                text-shadow: 0 2px 5px rgba(0,0,0,0.5);
            }
            `}
      </style>

      {!user && (
        <section style={styles.stickyNote}>
          <div style={styles.stickyTape}></div>
          <h3 style={styles.handwrittenTitle}>Join the Studio</h3>
          <form style={styles.accountForm} onSubmit={handleCreateAccount}>
            <input
              type="text"
              placeholder="Username"
              value={newAccountUsername}
              onChange={(e) => setNewAccountUsername(e.target.value)}
              style={styles.paperInput}
              required
            />
            <div style={styles.row}>
              <input
                type="text"
                placeholder="Bio..."
                value={newAccountBio}
                onChange={(e) => setNewAccountBio(e.target.value)}
                style={styles.paperInput}
              />
              <input
                type="number"
                placeholder="Followers"
                value={newAccountFollowers}
                onChange={(e) => setNewAccountFollowers(e.target.value)}
                style={styles.paperInput}
              />
            </div>
            <button type="submit" style={styles.actionButton} disabled={isCreatingAccount}>
              {isCreatingAccount ? " sketching..." : "Create Profile"}
            </button>
          </form>
          {accountError && (
            <p style={{ color: "#b42318", marginTop: "10px" }}>{accountError}</p>
          )}
        </section>
      )}

      <div style={styles.mainContainer}>
        <header style={styles.scrapbookHeader}>
          <div style={styles.profileVisual}>
            <div style={styles.polaroidFrame}>
              <div
                className="profile-hover-container"
                onClick={isOwnProfile ? () => setIsProfileUploadOpen(true) : undefined}
                style={{ cursor: isOwnProfile ? "pointer" : "default" }}
              >
                <img
                  src={(user && user.profilePic) || defaultUser.profilePic}
                  alt="profile"
                  style={styles.profilePic}
                />
                {isOwnProfile && (
                  <div className="plus-overlay">
                    <span className="plus-icon">+</span>
                  </div>
                )}
              </div>

              <div style={styles.tapeCorner}></div>
            </div>
          </div>

          <div style={styles.profileInfo}>
            <div style={styles.infoTop}>
              <h2 style={styles.artistName}>
                {activeArtistId && !user && !profileError
                  ? "Loading..."
                  : (user && user.username) || defaultUser.username}
              </h2>
              {isOwnProfile ? (
                <button
                  style={styles.primaryBtn}
                  onClick={() => setIsNewPostOpen(true)}
                  disabled={isScanning}
                >
                  + New Art
                </button>
              ) : (
                <button
                  style={styles.secondaryBtn}
                  onClick={handleFollowToggle}
                  disabled={isTogglingFollow}
                >
                  {isTogglingFollow ? "Updating..." : isFollowingProfile ? "Unfollow" : "Follow"}
                </button>
              )}
            </div>

            <div style={styles.statLine}>
              <span style={styles.statItem}>
                <strong>{isPostsLoading ? "..." : visiblePosts.length}</strong> drawings
              </span>
              <span style={styles.statItem}>
                <strong>{user?.followersCount ?? 0}</strong> followers
              </span>
              <span style={styles.statItem}>
                <strong>{(user?.following || []).length}</strong> following
              </span>
            </div>

            <div style={styles.bioBox}>
              <h4 style={styles.bioTitle}>About Me</h4>
              <p style={styles.bioText}>{user?.bio || defaultUser.bio}</p>
              <span style={styles.signature}>xoxo, {user?.username || "Artist"}</span>
            </div>

            {profileError && (
              <p style={{ color: "#b42318", marginTop: "10px" }}>{profileError}</p>
            )}

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
            <span><strong>{profileOwner.followersCount}</strong> followers</span>
          </div>
          <p style={styles.bio}>{profileOwner.bio}</p>
        </header>

        <div style={styles.galleryContainer} className="gallery-wrapper">
          {/* Post Grid */}
          {isPostsLoading ? (
            <div style={styles.loadingPosts}>Loading posts...</div>
          ) : (
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
                  setPosts((prev) =>
                    prev.map((p) => (normalizeId(p._id || p.id) === pid ? updatedPost : p))
                  );
                  setSelectedPost((prev) =>
                    prev && normalizeId(prev._id || prev.id) === pid ? updatedPost : prev
                  );
                  return updatedPost;
                } catch (err) {
                  console.error("Add comment failed:", err);
                  return null;
                }
              }}
            />
          )}

      {/* Upload Modal */}        </div>
      </div>

      {isOwnProfile && isNewPostOpen && (
        <div style={styles.overlay} onClick={() => setIsNewPostOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Upload Post</h3>
              <button style={styles.closeBtn} onClick={() => setIsNewPostOpen(false)}>
                ✕
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.dropZone} onClick={() => fileInputRef.current.click()}>
                {newImageFile ? (
                  <img
                    src={URL.createObjectURL(newImageFile)}
                    style={styles.previewImg}
                    alt="Preview"
                  />
                ) : (
                  <p style={{ color: "#888" }}>
                    Click to select artwork image
                  </p>
                )}
              </div>
              <div style={styles.dropZone} onClick={() => processInputRef.current.click()}>
                <p style={{ color: "#888", margin: 0 }}>
                  {newProcessFiles.length
                    ? `${newProcessFiles.length} process photo(s) selected (optional)`
                    : "Add process photos/slides (optional)"}
                </p>
              </div>
              {newProcessFiles.length > 0 && (
                <>
                  <div style={styles.processPreviewRow}>
                    {newProcessFiles.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} style={styles.processPreviewItem}>
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Process ${idx + 1}`}
                          style={styles.processPreviewImg}
                        />
                        <button
                          type="button"
                          style={styles.removeProcessBtn}
                          onClick={() => handleRemoveProcessFile(idx)}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={styles.processActions}>
                    <button
                      type="button"
                      style={styles.secondaryBtnMini}
                      onClick={() => processInputRef.current?.click()}
                    >
                      Add More
                    </button>
                    <button
                      type="button"
                      style={styles.secondaryBtnMini}
                      onClick={handleClearProcessFiles}
                    >
                      Clear All
                    </button>
                  </div>
                </>
              )}
              <input
                type="file"
                ref={processInputRef}
                style={{ display: "none" }}
                onChange={handleProcessFilesChange}
                accept="image/*"
                multiple
              />
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={styles.modalInput}
                placeholder="Title of piece..."
              />
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                style={styles.modalTextarea}
                placeholder="The story behind this..."
                rows={3}
              />
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                style={styles.modalInput}
                placeholder="Tags (e.g. #oil, #portrait)"
              />
              {newImageFile && (
                <p style={styles.aiNote}>
                  Loom AI check + protection runs on artwork and process photos. Only artwork is auto-tagged.
                </p>
              )}
              {isScanning && scanStatus && (
                <p style={styles.scanStatus}>{scanStatus}</p>
              )}
            </div>
            <div style={styles.modalFooter}>
              <button
                style={styles.primaryBtn}
                onClick={handleCreatePost}
                disabled={isScanning || !newImageFile}
              >
                {isScanning ? "Scanning..." : "Create Post"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isProfileUploadOpen && (
        <div style={styles.overlay} onClick={() => setIsProfileUploadOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Update Profile Picture</h3>
              <button style={styles.closeBtn} onClick={() => setIsProfileUploadOpen(false)}>
                ✕
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.dropZone} onClick={() => profileInputRef.current.click()}>
                {newProfilePicFile ? (
                  <img
                    src={URL.createObjectURL(newProfilePicFile)}
                    style={styles.previewImg}
                    alt="Profile Preview"
                  />
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <span style={{ fontSize: "24px", display: "block", marginBottom: "10px" }}>
                      📷
                    </span>
                    <p style={{ color: "#888", margin: 0 }}>Click to select new photo</p>
                  </div>
                )}
              </div>
              <input
                type="file"
                ref={profileInputRef}
                style={{ display: "none" }}
                onChange={handleProfileFileChange}
                accept="image/*"
              />
            </div>
            <div style={styles.modalFooter}>
              <button
                style={styles.primaryBtn}
                onClick={handleSaveProfilePic}
                disabled={!newProfilePicFile}
              >
                Save Photo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 4. AESTHETIC STYLES
// ==========================================
const styles = {
  pageBackground: {
    backgroundColor: "#E8E4D9",
    minHeight: "100vh",
    fontFamily: "'Lato', sans-serif",
    color: "#4A4A4A",
    backgroundImage:
      "linear-gradient(#D3CDC1 1px, transparent 1px), linear-gradient(90deg, #D3CDC1 1px, transparent 1px)",
    backgroundSize: "40px 40px",
    padding: "40px 20px",
  },

  mainContainer: {
    maxWidth: "1080px",
    margin: "0 auto",
    backgroundColor: "#FDFBF7",
    padding: "40px",
    borderRadius: "4px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.05)",
  },

  stickyNote: {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "260px",
    padding: "20px",
    backgroundColor: "#fffdf0",
    boxShadow: "2px 4px 15px rgba(0,0,0,0.1)",
    zIndex: 100,
    transform: "rotate(-2deg)",
  },
  stickyTape: {
    position: "absolute",
    top: "-12px",
    left: "35%",
    width: "30%",
    height: "25px",
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderLeft: "1px dashed rgba(0,0,0,0.1)",
    borderRight: "1px dashed rgba(0,0,0,0.1)",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
    transform: "rotate(-1deg)",
    backdropFilter: "blur(2px)",
  },
  handwrittenTitle: {
    fontFamily: "'Caveat', cursive",
    fontSize: "24px",
    color: "#6B705C",
    margin: "0 0 10px 0",
    textAlign: "center",
  },
  paperInput: {
    width: "100%",
    padding: "8px",
    marginBottom: "8px",
    border: "none",
    borderBottom: "1px dashed #A5A58D",
    backgroundColor: "transparent",
    outline: "none",
    fontFamily: "'Caveat', cursive",
    fontSize: "16px",
  },

  scrapbookHeader: {
    display: "flex",
    flexWrap: "wrap",
    gap: "60px",
    paddingBottom: "40px",
    marginBottom: "40px",
    position: "relative",
    overflow: "visible",
  },

  profileVisual: {
    flex: "0 0 220px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },

  polaroidFrame: {
    backgroundColor: "#fff",
    padding: "15px 15px 60px 15px",
    boxShadow: "5px 8px 20px rgba(0,0,0,0.15)",
    transform: "rotate(-3deg)",
    position: "relative",
    width: "100%",
  },

  profilePic: {
    width: "100%",
    height: "auto",
    aspectRatio: "1/1",
    objectFit: "cover",
    display: "block",
    filter: "sepia(15%) contrast(95%)",
    borderRadius: "2px",
    border: "1px solid #eee",
  },

  tapeCorner: {
    position: "absolute",
    top: "-15px",
    left: "50%",
    transform: "translateX(-50%) rotate(2deg)",
    width: "100px",
    height: "35px",
    backgroundColor: "rgba(230, 230, 230, 0.5)",
    borderLeft: "2px dotted rgba(0,0,0,0.1)",
    borderRight: "2px dotted rgba(0,0,0,0.1)",
    backdropFilter: "blur(2px)",
  },

  profileInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minWidth: "300px",
  },
  infoTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "20px",
  },
  artistName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: "42px",
    fontWeight: "400",
    color: "#333",
    margin: 0,
  },
  primaryBtn: {
    backgroundColor: "#A5A58D",
    color: "#fff",
    border: "none",
    padding: "12px 28px",
    borderRadius: "30px",
    fontSize: "15px",
    letterSpacing: "1px",
    cursor: "pointer",
    transition: "all 0.2s",
    fontFamily: "'Lato', sans-serif",
    boxShadow: "0 4px 10px rgba(165, 165, 141, 0.4)",
  },
  secondaryBtn: {
    backgroundColor: "#fff",
    color: "#6B705C",
    border: "1px solid #A5A58D",
    padding: "12px 24px",
    borderRadius: "30px",
    fontSize: "14px",
    letterSpacing: "0.5px",
    cursor: "pointer",
    transition: "all 0.2s",
    fontFamily: "'Lato', sans-serif",
  },
  statLine: {
    display: "flex",
    gap: "30px",
    fontFamily: "'Lato', sans-serif",
    fontSize: "16px",
    color: "#888",
    marginBottom: "30px",
  },
  statItem: { borderBottom: "1px solid transparent" },
  bioBox: {
    position: "relative",
    padding: "25px",
    backgroundColor: "#F4F1EA",
    borderLeft: "6px solid #CB997E",
    boxShadow: "inset 0 0 20px rgba(0,0,0,0.02)",
  },
  bioTitle: {
    fontFamily: "'Caveat', cursive",
    fontSize: "26px",
    color: "#CB997E",
    margin: "0 0 5px 0",
  },
  bioText: {
    fontFamily: "'Playfair Display', serif",
    fontStyle: "italic",
    fontSize: "18px",
    color: "#555",
    lineHeight: "1.6",
  },
  signature: {
    display: "block",
    marginTop: "15px",
    fontFamily: "'Caveat', cursive",
    fontSize: "24px",
    color: "#888",
    textAlign: "right",
  },

  dividerContainer: { textAlign: "center", margin: "40px 0" },
  dividerText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: "32px",
    color: "#4A4A4A",
    background: "#FDFBF7",
    padding: "0 30px",
    position: "relative",
    zIndex: 1,
  },
  dividerLine: { height: "1px", backgroundColor: "#D1D1D1", marginTop: "-18px" },

  galleryContainer: {
    padding: "20px 10px",
    width: "100%",
  },
  loadingPosts: {
    width: "100%",
    minHeight: "220px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#67584f",
    fontSize: "14px",
    letterSpacing: "0.3px",
  },

  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(74, 74, 74, 0.6)",
    backdropFilter: "blur(4px)",
    zIndex: 1000,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: "#fff",
    width: "500px",
    maxWidth: "90%",
    borderRadius: "4px",
    boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
    overflow: "hidden",
  },
  modalHeader: {
    padding: "20px",
    borderBottom: "1px solid #eee",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontFamily: "'Playfair Display', serif", margin: 0 },
  closeBtn: { background: "none", border: "none", fontSize: "20px", cursor: "pointer" },
  modalBody: { padding: "30px", display: "flex", flexDirection: "column", gap: "15px" },
  modalInput: {
    padding: "12px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontFamily: "'Lato', sans-serif",
  },
  modalTextarea: {
    padding: "12px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontFamily: "'Lato', sans-serif",
    resize: "vertical",
  },
  dropZone: {
    border: "2px dashed #CB997E",
    borderRadius: "8px",
    padding: "20px",
    textAlign: "center",
    cursor: "pointer",
    background: "#FFFCF9",
  },
  previewImg: { maxWidth: "100%", maxHeight: "200px", borderRadius: "4px" },
  aiNote: {
    fontSize: "12px",
    color: "#A5A58D",
    fontFamily: "'Lato', sans-serif",
    fontWeight: "bold",
  },
  scanStatus: {
    fontSize: "13px",
    color: "#6B705C",
    fontFamily: "'Lato', sans-serif",
    margin: 0,
  },
  processPreviewRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    maxHeight: "120px",
    overflowY: "auto",
  },
  processPreviewItem: {
    position: "relative",
    width: "72px",
    height: "72px",
    borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid #ddd",
    background: "#fff",
  },
  processPreviewImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  removeProcessBtn: {
    position: "absolute",
    top: "2px",
    right: "2px",
    border: "none",
    background: "rgba(0,0,0,0.65)",
    color: "#fff",
    fontSize: "11px",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    cursor: "pointer",
    lineHeight: 1,
    padding: 0,
  },
  processActions: {
    display: "flex",
    gap: "8px",
  },
  secondaryBtnMini: {
    border: "1px solid #A5A58D",
    background: "#fff",
    color: "#6B705C",
    borderRadius: "999px",
    padding: "6px 12px",
    fontSize: "12px",
    cursor: "pointer",
  },
  modalFooter: {
    padding: "20px",
    background: "#F9F9F9",
    display: "flex",
    justifyContent: "flex-end",
  },

  row: { display: "flex", gap: "10px" },
  actionButton: {
    width: "100%",
    padding: "8px",
    background: "#333",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontFamily: "'Lato', sans-serif",
  },
};

export default ProfilePage;

