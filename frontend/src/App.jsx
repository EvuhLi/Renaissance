import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { useState } from "react";
import "./App.css";

import FYP from "./FYP";
import LandingPage from "./LandingPage";
import LoginPage from "./LoginPage";
import ProfilePage from "./ProfilePage";
import AboutPage from "./AboutPage";

const GRADIENT = "linear-gradient(90deg, #3dd5f3, #b14dff)";
const NAV_HEIGHT = 56; // keep content from hiding under fixed nav

function App() {
  const [open, setOpen] = useState(false);

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

        {/* right: themed dropdown */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setOpen((v) => !v)}
            style={{
              border: "none",
              borderRadius: "999px",
              padding: "9px 14px",
              cursor: "pointer",
              fontWeight: 800,
              color: "white",
              background: GRADIENT,
              boxShadow: "0 10px 18px rgba(177, 77, 255, 0.22)",
            }}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            Menu ▾
          </button>

          {open && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 10px)",
                width: "190px",
                borderRadius: "14px",
                padding: "8px",
                background: "rgba(255,255,255,0.95)",
                border: "1px solid rgba(0,0,0,0.10)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.14)",
                zIndex: 50,
              }}
              role="menu"
            >
              <MenuItem to="/" label="Home" onPick={() => setOpen(false)} />
              <MenuItem to="/about" label="About" onPick={() => setOpen(false)} />
              <MenuItem to="/login" label="Login" onPick={() => setOpen(false)} />
              <MenuItem to="/profile" label="Profile" onPick={() => setOpen(false)} />
              <MenuItem to="/fyp" label="For You" onPick={() => setOpen(false)} />
            </div>
          )}
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<LoginPage />} />
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