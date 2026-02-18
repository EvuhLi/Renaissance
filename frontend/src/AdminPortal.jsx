import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

function fmtPct(v) {
  const n = Number(v || 0);
  return `${(Math.max(0, Math.min(1, n)) * 100).toFixed(1)}%`;
}

export default function AdminPortal() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const role = localStorage.getItem("role");
  const adminToken = localStorage.getItem("adminToken");
  const canAccess = role === "admin" && Boolean(adminToken);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken || ""}`,
    }),
    [adminToken]
  );

  const loadProfiles = useCallback(
    async (query = "") => {
      if (!canAccess) return;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: "100",
          search: query,
        });
        const res = await fetch(`${API_BASE}/api/admin/accounts?${params}`, {
          headers: authHeaders,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Failed: ${res.status}`);
        }
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (e) {
        setError(e.message || "Failed to load profiles");
      } finally {
        setLoading(false);
      }
    },
    [canAccess, authHeaders]
  );

  useEffect(() => {
    if (!canAccess) {
      navigate("/login");
      return;
    }
    loadProfiles("");
  }, [canAccess, loadProfiles, navigate]);

  const onDelete = async (profileId, username) => {
    if (!window.confirm(`Delete profile "${username}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(profileId)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Delete failed: ${res.status}`);
      }
      setItems((prev) => prev.filter((item) => item?.profile?.id !== profileId));
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  };

  const onSearchSubmit = (e) => {
    e.preventDefault();
    loadProfiles(search.trim());
  };

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>Admin Portal</h1>
        <button
          style={styles.logoutBtn}
          onClick={() => {
            localStorage.removeItem("accountId");
            localStorage.removeItem("username");
            localStorage.removeItem("role");
            localStorage.removeItem("adminToken");
            window.dispatchEvent(new Event("accountIdChanged"));
            navigate("/login");
          }}
        >
          Logout
        </button>
      </div>

      <form style={styles.searchRow} onSubmit={onSearchSubmit}>
        <input
          style={styles.searchInput}
          placeholder="Search by username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button style={styles.searchBtn} type="submit" disabled={loading}>
          {loading ? "Loading..." : "Search"}
        </button>
      </form>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Profile</th>
              <th style={styles.th}>Engagement</th>
              <th style={styles.th}>Bot Stats</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const p = item.profile || {};
              const e = item.engagement || {};
              const b = item.bot || {};
              return (
                <tr key={p.id}>
                  <td style={styles.td}>
                    <div style={styles.username}>{p.username}</div>
                    <div style={styles.statGrid}>
                      <div style={styles.metricCard}>
                        <div style={styles.metricLabel}>Followers</div>
                        <div style={styles.metricValue}>{p.followersCount || 0}</div>
                      </div>
                      <div style={styles.metricCard}>
                        <div style={styles.metricLabel}>Posts</div>
                        <div style={styles.metricValue}>{e.postsCount || 0}</div>
                      </div>
                    </div>
                    <div style={styles.sub}>Following: {p.followingCount || 0}</div>
                    <div style={styles.sub}>
                      Last active: {e.lastActiveAt ? new Date(e.lastActiveAt).toLocaleDateString() : "N/A"}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.statGrid}>
                      <div style={styles.metricCard}>
                        <div style={styles.metricLabel}>Likes Recv</div>
                        <div style={styles.metricValue}>{e.likesReceived || 0}</div>
                      </div>
                      <div style={styles.metricCard}>
                        <div style={styles.metricLabel}>Comments Recv</div>
                        <div style={styles.metricValue}>{e.commentsReceived || 0}</div>
                      </div>
                      <div style={styles.metricCard}>
                        <div style={styles.metricLabel}>Events</div>
                        <div style={styles.metricValue}>{e.totalEvents || 0}</div>
                      </div>
                      <div style={styles.metricCard}>
                        <div style={styles.metricLabel}>Likes Given</div>
                        <div style={styles.metricValue}>{e.likesGiven || 0}</div>
                      </div>
                    </div>
                    <div style={styles.sub}>Comments made: {e.commentsMade || 0}</div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.botMain}>{fmtPct(b.probability)}</div>
                    <div style={styles.sub}>Bot probability</div>
                    <div style={styles.botGrid}>
                      <div style={styles.metricCard}>
                        <div style={styles.metricLabel}>Behavior</div>
                        <div style={styles.metricValue}>
                          {Number(b?.behaviorFeatures?.behavioralBotScore || 0).toFixed(4)}
                        </div>
                      </div>
                      <div style={styles.metricCard}>
                        <div style={styles.metricLabel}>Network</div>
                        <div style={styles.metricValue}>
                          {Number(b?.behaviorFeatures?.network?.networkBotSignal || 0).toFixed(4)}
                        </div>
                      </div>
                    </div>
                    <div style={styles.sub}>Fast replies: {fmtPct(b?.behaviorFeatures?.fastReplyPct || 0)}</div>
                    <div style={styles.sub}>
                      Cluster density: {Number(b?.behaviorFeatures?.network?.communityDensity || 0).toFixed(4)}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <button
                      style={styles.deleteBtn}
                      onClick={() => onDelete(p.id, p.username)}
                    >
                      Delete Profile
                    </button>
                  </td>
                </tr>
              );
            })}
            {!items.length && !loading && (
              <tr>
                <td colSpan={4} style={styles.empty}>No profiles found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "84px 18px 24px",
    backgroundColor: "#F6F4EF",
    color: "#2E2E2E",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  title: {
    margin: 0,
    fontSize: "30px",
  },
  logoutBtn: {
    border: "1px solid #b7b39f",
    background: "#fff",
    color: "#2E2E2E",
    borderRadius: "8px",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 600,
  },
  searchRow: {
    display: "flex",
    gap: "10px",
    marginBottom: "14px",
  },
  searchInput: {
    flex: 1,
    borderRadius: "8px",
    border: "1px solid #c8c3b3",
    padding: "10px 12px",
    fontSize: "14px",
    background: "#fff",
  },
  searchBtn: {
    border: "none",
    borderRadius: "8px",
    padding: "10px 16px",
    fontWeight: 700,
    color: "#fff",
    background: "#6B705C",
    cursor: "pointer",
  },
  error: {
    color: "#b00020",
    marginBottom: "12px",
  },
  tableWrap: {
    border: "1px solid #d7d2c3",
    borderRadius: "12px",
    background: "#fff",
    overflow: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "850px",
  },
  th: {
    textAlign: "left",
    fontSize: "13px",
    borderBottom: "1px solid #e4dfd2",
    padding: "12px",
    color: "#555",
  },
  td: {
    verticalAlign: "top",
    borderBottom: "1px solid #f0ece1",
    padding: "12px",
  },
  username: {
    fontWeight: 800,
    marginBottom: "4px",
  },
  sub: {
    fontSize: "12px",
    color: "#666",
    marginBottom: "6px",
  },
  botMain: {
    fontSize: "22px",
    fontWeight: 800,
    color: "#6B705C",
  },
  botGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
    gap: "8px",
    marginTop: "8px",
    marginBottom: "10px",
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
    gap: "8px",
    marginTop: "8px",
    marginBottom: "10px",
  },
  metricCard: {
    border: "1px solid #e2ddcf",
    borderRadius: "8px",
    backgroundColor: "#faf8f2",
    padding: "6px 8px",
  },
  metricLabel: {
    fontSize: "11px",
    color: "#777",
    marginBottom: "2px",
  },
  metricValue: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#444",
  },
  metricValueTiny: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#444",
  },
  deleteBtn: {
    border: "none",
    borderRadius: "8px",
    padding: "8px 10px",
    background: "#B56576",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  empty: {
    padding: "20px",
    color: "#777",
  },
};
