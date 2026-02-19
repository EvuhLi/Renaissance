import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import "./App.css";

import NetworkFYP from "./NetworkFYP";
import LandingPage from "./LandingPage";
import LoginPage from "./LoginPage";
import SignUpPage from "./SignUpPage";
import ProfilePage from "./ProfilePage";
import AboutPage from "./AboutPage";
import SearchPage from "./SearchPage";
import AdminPortal from "./AdminPortal";

const GRADIENT = "linear-gradient(90deg, #3dd5f3, #b14dff)";
const NAV_HEIGHT = 56; // keep content from hiding under fixed nav

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const [accountId, setAccountId] = useState(
    typeof window !== "undefined" ? localStorage.getItem("accountId") : null
  );
  const [role, setRole] = useState(
    typeof window !== "undefined" ? localStorage.getItem("role") || "user" : "user"
  );
  const location = useLocation();
  const hideNav = false; // Show navbar on all pages when logged in
  
  useEffect(() => {
    const handleStorageChange = () => {
      setAccountId(localStorage.getItem("accountId"));
      setRole(localStorage.getItem("role") || "user");
    };
    
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("accountIdChanged", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("accountIdChanged", handleStorageChange);
    };
  }, []);
  
  const storedAccountId = accountId;
  const isAdmin = role === "admin";
  const profilePath = storedAccountId ? "/profile/" + encodeURIComponent(storedAccountId) : "/profile";

  return (
    <>
      {/* FIXED NAVBAR */}
      {!hideNav && (
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,

          height: `${NAV_HEIGHT}px`,
          padding: "10px 14px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(8px)",
        }}
      >
        {/* left: brand */}
        <Link
          to="/"
          style={{
            textDecoration: "none",
            fontWeight: 900,
            letterSpacing: "0.4px",
            color: "#2D1B1B",
          }}
        >
          LOOM
        </Link>

        {/* right: nav links */}
        <div style={{ display: "flex", gap: "30px", alignItems: "center" }}>
          {storedAccountId ? (
            <>
              {!isAdmin && (
                <Link
                  to="/fyp"
                  style={{
                    textDecoration: "none",
                    fontWeight: 700,
                    color: "#111",
                    fontSize: "14px",
                  }}
                >
                  For You
                </Link>
              )}
              {!isAdmin && (
                <Link
                  to="/about"
                  style={{
                    textDecoration: "none",
                    fontWeight: 700,
                    color: "#111",
                    fontSize: "14px",
                  }}
                >
                  About
                </Link>
              )}
              {!isAdmin && (
                <Link
                  to="/search"
                  style={{
                    textDecoration: "none",
                    fontWeight: 700,
                    color: "#111",
                    fontSize: "14px",
                  }}
                >
                  Search
                </Link>
              )}
              {isAdmin ? (
                <Link
                  to="/admin"
                  style={{
                    textDecoration: "none",
                    fontWeight: 700,
                    color: "#111",
                    fontSize: "14px",
                  }}
                >
                  Admin
                </Link>
              ) : (
                <Link
                  to={profilePath}
                  style={{
                    textDecoration: "none",
                    fontWeight: 700,
                    color: "#111",
                    fontSize: "14px",
                  }}
                >
                  Profile
                </Link>
              )}
              <button
                onClick={() => {
                  localStorage.removeItem("accountId");
                  localStorage.removeItem("username");
                  localStorage.removeItem("role");
                  localStorage.removeItem("adminToken");
                  window.dispatchEvent(new Event("accountIdChanged"));
                  window.location.href = "/";
                }}
                style={{
                  textDecoration: "none",
                  fontWeight: 700,
                  color: "#111",
                  fontSize: "14px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/about"
                style={{
                  textDecoration: "none",
                  fontWeight: 700,
                  color: "#111",
                  fontSize: "14px",
                }}
              >
                About
              </Link>
              <Link
                to="/search"
                style={{
                  textDecoration: "none",
                  fontWeight: 700,
                  color: "#111",
                  fontSize: "14px",
                }}
              >
                Search
              </Link>
              <Link
                to="/login"
                style={{
                  textDecoration: "none",
                  fontWeight: 700,
                  color: "#111",
                  fontSize: "14px",
                }}
              >
                Login
              </Link>
            </>
          )}
        </div>
      </nav>
      )}

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:artistId" element={<ProfilePage />} />
        <Route path="/fyp" element={<NetworkFYP />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/admin" element={<AdminPortal />} />
      </Routes>
    </>
  );
}

function MenuItem({ to, label, onPick }) {
  return (
    <Link
      to={to}
      onClick={onPick}
      style={{
        display: "block",
        padding: "10px 10px",
        borderRadius: "12px",
        textDecoration: "none",
        color: "#111",
        fontWeight: 700,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(61, 213, 243, 0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
      role="menuitem"
    >
      {label}
    </Link>
  );
}

export default App;
