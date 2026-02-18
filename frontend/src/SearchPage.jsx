import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const BACKEND_URL = "http://localhost:3001";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadArtistsFromPosts = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`${BACKEND_URL}/api/posts`);
        if (!res.ok) throw new Error("Failed to load posts");
        const posts = await res.json();

        const map = new Map();
        for (const post of posts) {
          const postUser = post.user;
          const username =
            postUser && typeof postUser === "object" ? postUser.username : postUser;
          const rawArtistId =
            post.artistId ||
            (postUser && typeof postUser === "object" ? postUser._id : undefined);
          const artistId =
            rawArtistId && typeof rawArtistId === "object"
              ? rawArtistId.$oid || String(rawArtistId)
              : rawArtistId;

          if (!username) continue;

          const key = (username || "").toLowerCase();
          if (!map.has(key)) {
            map.set(key, {
              username,
              artistId: artistId || null,
              posts: 1,
            });
          } else {
            const existing = map.get(key);
            existing.posts += 1;
            if (!existing.artistId && artistId) existing.artistId = artistId;
          }
        }

        setArtists(Array.from(map.values()).sort((a, b) => a.username.localeCompare(b.username)));
      } catch (err) {
        console.error("Search load error:", err);
        setError("Could not load artists.");
      } finally {
        setLoading(false);
      }
    };

    loadArtistsFromPosts();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter((a) => a.username.toLowerCase().includes(q));
  }, [artists, query]);

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={title}>Search Artists</h1>
        <p style={subtitle}>Frontend-only search for now (from existing posts).</p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username..."
          style={input}
        />

        {loading && <p style={meta}>Loading artists...</p>}
        {error && <p style={errorText}>{error}</p>}
        {!loading && !error && (
          <p style={meta}>
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </p>
        )}

        <div style={list}>
          {filtered.map((artist) => {
            const to = artist.artistId
              ? `/profile/${encodeURIComponent(artist.artistId)}`
              : `/profile`;
            return (
              <Link key={`${artist.username}-${artist.artistId || "none"}`} to={to} style={row}>
                <span style={username}>{artist.username}</span>
                <span style={count}>{artist.posts} post{artist.posts === 1 ? "" : "s"}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const page = {
  minHeight: "calc(100vh - 56px)",
  padding: "84px 20px 20px",
  background: "#f5f1e8",
};

const card = {
  maxWidth: "760px",
  margin: "0 auto",
  background: "#fffdf8",
  border: "2px solid rgba(0,0,0,0.2)",
  borderRadius: "14px",
  padding: "18px",
};

const title = { margin: "0 0 6px", color: "#121212" };
const subtitle = { margin: "0 0 14px", color: "#555", fontSize: "14px" };

const input = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1px solid rgba(0,0,0,0.2)",
  marginBottom: "10px",
  fontSize: "14px",
};

const meta = { margin: "0 0 12px", color: "#666", fontSize: "13px" };
const errorText = { margin: "0 0 12px", color: "#b42318", fontSize: "13px" };

const list = { display: "grid", gap: "8px" };

const row = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  textDecoration: "none",
  color: "#111",
  padding: "10px 12px",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: "10px",
  background: "#fff",
};

const username = { fontWeight: 700 };
const count = { color: "#666", fontSize: "12px" };
