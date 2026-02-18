import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import "./App.css";

import FYP from "./FYP";
import LandingPage from "./LandingPage";
import LoginPage from "./LoginPage";
import SignUpPage from "./SignUpPage";
import ProfilePage from "./ProfilePage";
import AboutPage from "./AboutPage";

const GRADIENT = "linear-gradient(90deg, #3dd5f3, #b14dff)";
const NAV_HEIGHT = 56; // keep content from hiding under fixed nav

function App() {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(
    typeof window !== "undefined" ? localStorage.getItem("accountId") : null
  );
  
  useEffect(() => {
    const handleStorageChange = () => {
      setAccountId(localStorage.getItem("accountId"));
    };
    
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("accountIdChanged", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("accountIdChanged", handleStorageChange);
    };
  }, []);
  
  const storedAccountId = accountId;
  const profilePath = storedAccountId ? "/profile/" + encodeURIComponent(storedAccountId) : "/profile";

  return (
    <BrowserRouter>
      {/* FIXED NAVBAR */}
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
            color: "#111",
          }}
        >
          LOOM
        </Link>

        {/* right: nav links */}
        <div style={{ display: "flex", gap: "30px", alignItems: "center" }}>
          {storedAccountId ? (
            <>
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
              <button
                onClick={() => {
                  localStorage.removeItem("accountId");
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

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:artistId" element={<ProfilePage />} />
        <Route path="/fyp" element={<FYP />} />
      </Routes>
    </BrowserRouter>
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