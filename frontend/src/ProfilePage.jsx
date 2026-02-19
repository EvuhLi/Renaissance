import React, { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import Post from "./Post";
import { getJSONCached, invalidateCacheByPrefix } from "./utils/requestCache";

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
  const profileCacheKey = `profile-cache:${activeArtistId || storedUsername || "anon"}`;
  const profileCacheTTL = 60 * 1000; // 60s cache

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
  const [availableCommunities, setAvailableCommunities] = useState([]);
  const [selectedCommunityIds, setSelectedCommunityIds] = useState([]);
  const [newCommunityName, setNewCommunityName] = useState("");
  const [newCommunityVisibility, setNewCommunityVisibility] = useState("public");
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(false);
  const [isCreatingCommunity, setIsCreatingCommunity] = useState(false);
  const [newAccountUsername, setNewAccountUsername] = useState("");
  const [newAccountBio, setNewAccountBio] = useState("");
  const [newAccountFollowers, setNewAccountFollowers] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [accountError, setAccountError] = useState("");
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const [user, setUser] = useState(null);
  const [viewer, setViewer] = useState(() => {
    try {
      const raw = localStorage.getItem("viewerSnapshot");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  });
  const [posts, setPosts] = useState([]);
  const [isPostsLoading, setIsPostsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isBioModalOpen, setIsBioModalOpen] = useState(false);
  const [bioEditValue, setBioEditValue] = useState("");
  const [isUpdatingBio, setIsUpdatingBio] = useState(false);
  const [cachedFollowState, setCachedFollowState] = useState(null);

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
    let cancelled = false;
    if (!resolvedArtistId && storedUsername) {
      setUser((prev) => prev || defaultUser);
    } else {
      setUser(null);
    }
    setProfileError("");
    setIsPostsLoading(true);
    setIsProfileLoading(true);

    // Fast path: hydrate from cache if fresh
    try {
      const cachedRaw = localStorage.getItem(profileCacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached?.ts && Date.now() - cached.ts < profileCacheTTL) {
          if (cached.user) setUser(cached.user);
          if (Array.isArray(cached.posts)) {
            setPosts(cached.posts);
            setIsPostsLoading(false);
          }
          setIsProfileLoading(false);
        }
      }
    } catch (e) {
      // ignore cache errors
    }

    const loadAccountAndPosts = async () => {
      try {
        const buildPostsUrl = (artistIdValue, usernameValue) => {
          const params = new URLSearchParams();
          if (artistIdValue) params.set("artistId", String(artistIdValue));
          if (usernameValue) params.set("username", String(usernameValue));
          params.set("limit", "12");
          return `${BACKEND_URL}/api/posts${params.toString() ? `?${params}` : ""}`;
        };

        const initialArtistId = normalizeId(activeArtistId || resolvedArtistId);
        const initialUsername = String(storedUsername || defaultUser.username || "")
          .trim()
          .toLowerCase();
        const initialPostsUrl = buildPostsUrl(initialArtistId, initialUsername);

        // 1) Fast lane: render posts first.
        const initialPostsPromise = getJSONCached(initialPostsUrl, {
          ttlMs: 30000,
          timeoutMs: 7000,
        }).catch(() => []);

        // PARALLEL FETCH: Fetch account and viewer in parallel to reduce waterfall latency
        const accountUrl = activeArtistId
          ? `${BACKEND_URL}/api/accounts/id/${encodeURIComponent(activeArtistId)}`
          : `${BACKEND_URL}/api/accounts/${encodeURIComponent(defaultUser.username)}`;
        const isOwnProfileFastPath = Boolean(
          activeArtistId &&
            storedAccountId &&
            String(activeArtistId) === String(storedAccountId) &&
            viewer
        );

        const viewerFetchPromise = Promise.resolve(viewer || null);

        // 2) Background lane: hydrate profile/account metadata
        const accountPromise = isOwnProfileFastPath
          ? Promise.resolve(viewer)
          : getJSONCached(accountUrl, { ttlMs: 60000, timeoutMs: 8000 }).catch(() => null);
        const viewerPromise = viewerFetchPromise;

        initialPostsPromise.then((initialPosts) => {
          if (cancelled) return;
          if (Array.isArray(initialPosts)) {
            setPosts(initialPosts);
            setIsPostsLoading(false);
          }
        });

        const [accountData, viewerData] = await Promise.all([
          accountPromise,
          viewerPromise,
        ]);
        if (cancelled) return;

        let loadedUser = null;
        if (accountData) {
          loadedUser = accountData;
          setUser(loadedUser);
        } else {
          setProfileError("Could not load artist profile.");
        }

        if (viewerData) {
          setViewer(viewerData);
          try {
            localStorage.setItem("viewerSnapshot", JSON.stringify(viewerData));
          } catch {
            // ignore storage errors
          }
          console.log("Loaded default viewer account:", viewerData);
        }
        setIsProfileLoading(false);

        const targetArtistId = normalizeId(loadedUser?._id || activeArtistId);
        const targetUsername = String(
          loadedUser?.username || defaultUser.username || ""
        )
          .trim()
          .toLowerCase();

        const reqSeq = ++postsReqSeqRef.current;
        const finalPostsUrl = buildPostsUrl(targetArtistId, targetUsername);
        const initialPosts = await initialPostsPromise;
        let postsData = initialPosts;

        if (finalPostsUrl !== initialPostsUrl) {
          postsData = await getJSONCached(finalPostsUrl, { ttlMs: 30000 }).catch((err) => {
            console.error("Failed to fetch posts:", err?.message || err);
            return [];
          });
        }
        if (reqSeq !== postsReqSeqRef.current) return;
        if (cancelled) return;
        const normalizedPosts = Array.isArray(postsData) ? postsData : [];
        setPosts(normalizedPosts);
        setIsPostsLoading(false);

        // Update cache
        try {
          localStorage.setItem(
            profileCacheKey,
            JSON.stringify({ ts: Date.now(), user: loadedUser || null, posts: normalizedPosts })
          );
        } catch (e) {
          // ignore cache write errors
        }
      } catch (e) {
        console.error(e);
        setProfileError("Could not load artist profile.");
        setIsPostsLoading(false);
        setIsProfileLoading(false);
      }
    };

    loadAccountAndPosts();
    return () => {
      cancelled = true;
    };
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
        invalidateCacheByPrefix(`${BACKEND_URL}/api/accounts/`);
        setIsProfileUploadOpen(false);
        setNewProfilePicFile(null);
      } catch (err) {
        console.error("Save profile picture failed:", err);
        alert("Failed to save profile picture.");
      }
    };
    reader.readAsDataURL(newProfilePicFile);
  };

  const handleOpenBioModal = () => {
    setBioEditValue(user?.bio || "");
    setIsBioModalOpen(true);
  };

  const handleCloseBioModal = () => {
    setIsBioModalOpen(false);
    setBioEditValue("");
  };

  const handleSaveBio = async () => {
    if (!isOwnProfile) {
      alert("You can only edit your own bio.");
      return;
    }
    setIsUpdatingBio(true);
    try {
      // 1. We must target the specific user by their ID
      const userIdToUpdate = currentUser?._id?.$oid || currentUser?._id || currentUser?.id;
      
      if (!userIdToUpdate) {
        throw new Error("Could not find user ID to update.");
      }

      const response = await fetch(`${BACKEND_URL}/api/accounts/${userIdToUpdate}/bio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: bioEditValue,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update bio");
      }

      const updatedUser = await response.json();
      
      // 2. Update the state so the new bio shows up immediately
      setUser(updatedUser);
      setViewer(updatedUser);
      invalidateCacheByPrefix(`${BACKEND_URL}/api/accounts/`);
      
      // 3. Clear the cache so it doesn't revert on refresh
      localStorage.removeItem(`profile-cache:${userIdToUpdate}`);
      localStorage.removeItem(`profile-cache:${currentUser?.username?.toLowerCase()}`);
      
      handleCloseBioModal();
    } catch (err) {
      console.error("Bio update failed:", err);
      alert("Failed to update bio: " + err.message);
    } finally {
      setIsUpdatingBio(false);
    }
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

      // Keep tagging resilient even when user leaves tag input blank.
      if (flatTags.length < 3) {
        const fallbackPool = [
          newTitle.trim(),
          ...selectedCommunityIds
            .map((id) => availableCommunities.find((c) => c._id === id)?.name || "")
            .filter(Boolean),
          "art",
          "creative",
          "loom",
          "untagged",
        ]
          .map((t) => String(t || "").trim().toLowerCase())
          .filter(Boolean);
        for (const t of fallbackPool) {
          if (!flatTags.includes(t)) flatTags.push(t);
          if (flatTags.length >= 3) break;
        }
      }

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
        communityTags: selectedCommunityIds
          .map((communityId) => {
            const found = availableCommunities.find((c) => c._id === communityId);
            if (!found) return null;
            return {
              communityId: found._id,
              name: found.name,
              visibility: found.visibility || "public",
              ownerAccountId: found.ownerAccountId,
            };
          })
          .filter(Boolean),
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
      invalidateCacheByPrefix(`${BACKEND_URL}/api/posts`);
      invalidateCacheByPrefix(`${BACKEND_URL}/api/fyp`);
      setIsNewPostOpen(false);
      setNewDescription("");
      setNewTags("");
      setNewTitle("");
      setNewImageFile(null);
      setNewProcessFiles([]);
      setSelectedCommunityIds([]);
      setNewCommunityName("");
      setNewCommunityVisibility("public");
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

  const followCacheKey = currentUsername && profileOwnerId
    ? `follow-cache:${currentUsername}:${profileOwnerId}`
    : null;

  const hasViewerIdentity = Boolean(currentUserId || currentUsername);
  const hasOwnerIdentity = Boolean(profileOwnerId || profileOwnerUsername || resolvedArtistId);
  const isOwnProfileOptimistic =
    !resolvedArtistId &&
    (Boolean(storedAccountId) || Boolean(storedUsername));
  const isIdentityResolved = hasViewerIdentity && hasOwnerIdentity;

  const isOwnProfile = resolvedArtistId
    ? Boolean(currentUserId && String(currentUserId) === String(resolvedArtistId))
    : Boolean(
        (currentUserId && profileOwnerId && String(currentUserId) === String(profileOwnerId)) ||
          (currentUsername && profileOwnerUsername && currentUsername === profileOwnerUsername)
      );

  const isFollowingProfile = Boolean(
    !isOwnProfile &&
      profileOwnerId &&
      (cachedFollowState ?? (
        Array.isArray(currentUser?.following) &&
        currentUser.following.map((id) => String(id)).includes(String(profileOwnerId))
      ))
  );

  const refreshCommunities = async () => {
    if (!currentUserId) return;
    setIsLoadingCommunities(true);
    try {
      const data = await getJSONCached(
        `${BACKEND_URL}/api/communities/account/${encodeURIComponent(currentUserId)}`,
        { ttlMs: 30000, timeoutMs: 25000, staleOnError: true, staleMaxAgeMs: Infinity }
      );
      const all = [...(data?.owned || []), ...(data?.followed || [])];
      const dedup = [];
      const seen = new Set();
      for (const c of all) {
        const id = String(c?._id || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        dedup.push({
          _id: id,
          ownerAccountId: String(c.ownerAccountId || ""),
          ownerUsername: String(c.ownerUsername || ""),
          name: String(c.name || ""),
          visibility: c.visibility === "private" ? "private" : "public",
        });
      }
      setAvailableCommunities(dedup);
    } catch (err) {
      console.warn("Load communities deferred:", err?.message || err);
    } finally {
      setIsLoadingCommunities(false);
    }
  };

  const handleCreateCommunity = async () => {
    const name = newCommunityName.trim();
    if (!name || !currentUserId) return;
    setIsCreatingCommunity(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/communities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAccountId: currentUserId,
          ownerUsername: currentUsername,
          name,
          visibility: newCommunityVisibility,
        }),
      });
      if (res.status === 404) {
        alert("Community service is not available yet. Restart backend to load new routes.");
        return;
      }
      if (!res.ok) throw new Error("Failed to create community");
      const created = await res.json();
      const normalized = {
        _id: String(created._id || ""),
        ownerAccountId: String(created.ownerAccountId || currentUserId),
        ownerUsername: String(created.ownerUsername || currentUsername),
        name: String(created.name || name),
        visibility: created.visibility === "private" ? "private" : "public",
      };
      setAvailableCommunities((prev) => {
        if (prev.some((c) => c._id === normalized._id)) return prev;
        return [normalized, ...prev];
      });
      setSelectedCommunityIds((prev) =>
        prev.includes(normalized._id) ? prev : [...prev, normalized._id]
      );
      invalidateCacheByPrefix(`${BACKEND_URL}/api/communities/account/`);
      setNewCommunityName("");
      setNewCommunityVisibility("public");
    } catch (err) {
      console.error("Create community failed:", err);
      alert("Could not create community.");
    } finally {
      setIsCreatingCommunity(false);
    }
  };

  useEffect(() => {
    if (!isOwnProfile || !currentUserId) return;
    refreshCommunities();
  }, [isOwnProfile, currentUserId]);

  useEffect(() => {
    if (!followCacheKey) return;
    try {
      const raw = localStorage.getItem(followCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.ts && Date.now() - parsed.ts < profileCacheTTL) {
        setCachedFollowState(Boolean(parsed.isFollowing));
      }
    } catch {
      // ignore cache errors
    }
  }, [followCacheKey, profileCacheTTL]);

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
      invalidateCacheByPrefix(`${BACKEND_URL}/api/accounts/`);
      if (followCacheKey) {
        setCachedFollowState(Boolean(result.isFollowing));
        try {
          localStorage.setItem(
            followCacheKey,
            JSON.stringify({ ts: Date.now(), isFollowing: Boolean(result.isFollowing) })
          );
        } catch {
          // ignore cache errors
        }
      }
    } catch (err) {
      console.error("Follow toggle failed:", err);
      alert("Could not update follow state.");
    } finally {
      setIsTogglingFollow(false);
    }
  };


  const handleDeletePost = async (postId) => {
    try {
      // 1. Tell the backend to delete it
      await fetch(`${BACKEND_URL}/api/posts/${postId}`, {
        method: "DELETE",
      });
      
      // 2. Remove it from the UI without refreshing the page
      setPosts((prevPosts) => prevPosts.filter((post) => String(post._id || post.id) !== postId));
      invalidateCacheByPrefix(`${BACKEND_URL}/api/posts`);
      invalidateCacheByPrefix(`${BACKEND_URL}/api/fyp`);
      
    } catch (error) {
      console.error("Failed to delete post:", error);
    }
  };

  const handleUpdatePost = async (postId, updates) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/posts/${encodeURIComponent(postId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...updates,
          actorAccountId: normalizeId(currentUser?._id) || "",
          actorUsername: String(currentUser?.username || "").trim().toLowerCase(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || "Failed to update post");
      }

      const pid = normalizeId(result._id || postId);
      setPosts((prev) =>
        prev.map((p) => (normalizeId(p._id || p.id) === pid ? { ...p, ...result } : p))
      );
      setSelectedPost((prev) =>
        prev && normalizeId(prev._id || prev.id) === pid ? { ...prev, ...result } : prev
      );
      invalidateCacheByPrefix(`${BACKEND_URL}/api/posts`);
      invalidateCacheByPrefix(`${BACKEND_URL}/api/fyp`);
      return result;
    } catch (err) {
      console.error("Update post failed:", err);
      alert(err.message || "Could not update post.");
      return null;
    }
  };

  return (
    <div style={styles.pageBackground}>
      <style>
        {`
            @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Lato:wght@300;400;700&display=swap');

            @keyframes shimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }

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
                {isProfileLoading && !user ? (
                  <span style={styles.skeletonName} />
                ) : (
                  (user && user.username) || defaultUser.username
                )}
              </h2>
              {isOwnProfileOptimistic ? (
                <button
                  style={styles.primaryBtn}
                  onClick={() => setIsNewPostOpen(true)}
                  disabled={isScanning}
                >
                  + New Art
                </button>
              ) : !isIdentityResolved ? null : isOwnProfile ? (
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
                <strong>{isProfileLoading ? "..." : user?.followersCount ?? 0}</strong> followers
              </span>
              <span style={styles.statItem}>
                <strong>{isProfileLoading ? "..." : (user?.following || []).length}</strong> following
              </span>
            </div>

            <div style={styles.bioBox}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h4 style={styles.bioTitle}>About Me</h4>
                {isOwnProfile && (
                  <button
                    onClick={handleOpenBioModal}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px",
                    }}
                    title="Edit bio"
                  >
                    ✏️
                  </button>
                )}
              </div>
              <p style={styles.bioText}>
                {isProfileLoading && !user ? (
                  <span style={styles.skeletonText}>Loading profile...</span>
                ) : (
                  user?.bio || defaultUser.bio
                )}
              </p>
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
              deletePost={handleDeletePost}
              addComment={async (postId, text) => {
                if (!text || !text.trim()) return null;
                const pid = normalizeId(postId);
                const author = (currentUser?.username || storedUsername || "").trim().toLowerCase();
                if (!author) return null;
                try {
                  const response = await fetch(`${BACKEND_URL}/api/posts/${pid}/comment`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: author, text }),
                  });
                  if (!response.ok) throw new Error("Failed to add comment");
                  const updatedPost = await response.json();
                  // Update posts list and modal - merge with existing post to preserve all fields
                  setPosts((prev) =>
                    prev.map((p) => (normalizeId(p._id || p.id) === pid ? { ...p, ...updatedPost } : p))
                  );
                  setSelectedPost((prev) =>
                    prev && normalizeId(prev._id || prev.id) === pid ? { ...prev, ...updatedPost } : prev
                  );
                  return updatedPost;
                } catch (err) {
                  console.error("Add comment failed:", err);
                  return null;
                }
              }}
              updatePost={handleUpdatePost}
              onUpdatePost={(updatedPost) => {
                const pid = normalizeId(updatedPost?._id || updatedPost?.id);
                if (!pid) return;
                setPosts((prev) =>
                  prev.map((p) => (normalizeId(p._id || p.id) === pid ? { ...p, ...updatedPost } : p))
                );
                setSelectedPost((prev) =>
                  prev && normalizeId(prev._id || prev.id) === pid ? { ...prev, ...updatedPost } : prev
                );
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
              <div style={styles.uploadLayout}>
                <div style={styles.uploadLeftColumn}>
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
                </div>

                <div style={styles.uploadRightColumn}>
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
                  <div style={styles.communitySection}>
                    <div style={styles.communitySectionHeader}>Communities</div>
                    <div style={styles.communityCreateRow}>
                      <input
                        type="text"
                        value={newCommunityName}
                        onChange={(e) => setNewCommunityName(e.target.value)}
                        style={{ ...styles.modalInput, margin: 0 }}
                        placeholder="Create a community name"
                      />
                      <select
                        value={newCommunityVisibility}
                        onChange={(e) => setNewCommunityVisibility(e.target.value)}
                        style={styles.communitySelect}
                      >
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                      </select>
                      <button
                        type="button"
                        style={styles.secondaryBtnMini}
                        onClick={handleCreateCommunity}
                        disabled={isCreatingCommunity || !newCommunityName.trim()}
                      >
                        {isCreatingCommunity ? "Creating..." : "Create"}
                      </button>
                    </div>
                    <div style={styles.communityChipRow}>
                      {isLoadingCommunities && (
                        <span style={styles.communityMuted}>Loading communities...</span>
                      )}
                      {!isLoadingCommunities && availableCommunities.length === 0 && (
                        <span style={styles.communityMuted}>No communities yet</span>
                      )}
                      {availableCommunities.map((community) => {
                        const checked = selectedCommunityIds.includes(community._id);
                        return (
                          <label key={community._id} style={styles.communityChip}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setSelectedCommunityIds((prev) => {
                                  if (e.target.checked) {
                                    return prev.includes(community._id)
                                      ? prev
                                      : [...prev, community._id];
                                  }
                                  return prev.filter((id) => id !== community._id);
                                });
                              }}
                            />
                            <span>
                              {community.name}
                              {community.visibility === "private" ? " [lock]" : ""}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  {newImageFile && (
                    <p style={styles.aiNote}>
                      Loom AI check + protection runs on artwork and process photos. Only artwork is auto-tagged.
                    </p>
                  )}
                  {isScanning && scanStatus && (
                    <p style={styles.scanStatus}>{scanStatus}</p>
                  )}
                </div>
              </div>
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

      {/* Bio Edit Modal */}
      {isBioModalOpen && (
        <div style={styles.overlay} onClick={handleCloseBioModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: "#2D1B1B", fontFamily: "'Lato', sans-serif" }}>
                Edit About Me
              </h3>
              <button
                onClick={handleCloseBioModal}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  padding: "0",
                  color: "#666",
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: "20px" }}>
              <textarea
                value={bioEditValue}
                onChange={(e) => setBioEditValue(e.target.value)}
                placeholder="Write your bio here..."
                style={{
                  width: "100%",
                  minHeight: "120px",
                  padding: "12px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontFamily: "'Lato', sans-serif",
                  fontSize: "14px",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
                maxLength={500}
              />
              <p style={{ fontSize: "12px", color: "#888", marginTop: "8px", marginBottom: "0" }}>
                {bioEditValue.length}/500
              </p>
            </div>
            <div
              style={{
                padding: "16px 20px",
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
                borderTop: "1px solid #eee",
              }}
            >
              <button
                onClick={handleCloseBioModal}
                disabled={isUpdatingBio}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #ddd",
                  background: "#f5f5f5",
                  color: "#333",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontFamily: "'Lato', sans-serif",
                  opacity: isUpdatingBio ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBio}
                disabled={isUpdatingBio}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  background: "#A63D3D",
                  color: "#fff",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontFamily: "'Lato', sans-serif",
                  opacity: isUpdatingBio ? 0.6 : 1,
                }}
              >
                {isUpdatingBio ? "Saving..." : "Save"}
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
  skeletonName: {
    display: "inline-block",
    width: "190px",
    height: "40px",
    borderRadius: "8px",
    background: "linear-gradient(90deg, #e6dfd2 25%, #f1ece2 50%, #e6dfd2 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s infinite",
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
  skeletonText: {
    display: "inline-block",
    width: "240px",
    maxWidth: "100%",
    height: "18px",
    borderRadius: "6px",
    background: "linear-gradient(90deg, #e6dfd2 25%, #f1ece2 50%, #e6dfd2 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s infinite",
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
    width: "900px",
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
  modalBody: {
    padding: "24px",
    maxHeight: "75vh",
    overflowY: "auto",
  },
  uploadLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) minmax(320px, 1.3fr)",
    gap: "18px",
    alignItems: "start",
  },
  uploadLeftColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  uploadRightColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
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
  communitySection: {
    border: "1px solid #E1D8CC",
    borderRadius: "8px",
    padding: "12px",
    background: "#FFFCF9",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  communitySectionHeader: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#6B705C",
  },
  communityCreateRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    gap: "8px",
    alignItems: "center",
  },
  communitySelect: {
    border: "1px solid #ddd",
    borderRadius: "4px",
    padding: "10px 8px",
    background: "#fff",
    fontFamily: "'Lato', sans-serif",
  },
  communityChipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  communityChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    border: "1px solid #D9CDBF",
    borderRadius: "999px",
    padding: "4px 10px",
    fontSize: "12px",
    background: "#fff",
  },
  communityMuted: {
    fontSize: "12px",
    color: "#9A8F84",
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

