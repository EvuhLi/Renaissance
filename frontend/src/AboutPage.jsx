import React from "react";
import { Link } from "react-router-dom";

export default function AboutPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ margin: 0, fontSize: 28 }}>About Loom</h1>
        <p style={{ marginTop: 10, color: "#444", lineHeight: 1.6 }}>
          Loom is a project that helps you discover, organize, and explore artists you care about.
          This site is built with React + Vite.
        </p>

        <h3 style={{ marginTop: 18 }}>What you can do</h3>
        <ul style={{ marginTop: 8, color: "#444", lineHeight: 1.7 }}>
          <li>Browse and search artists</li>
          <li>Save favorites to your profile</li>
          <li>Get a cleaner view of artist info</li>
        </ul>

        <h3 style={{ marginTop: 18 }}>Team</h3>
        <p style={{ marginTop: 8, color: "#444", lineHeight: 1.6 }}>
          Built by the Loom team at CMU. (Add names here.)
        </p>

        <div style={{ marginTop: 22, display: "flex", gap: 10 }}>
          <Link to="/" style={btn}>
            Back Home
          </Link>
          <Link to="/login" style={{ ...btn, background: "transparent", color: "#111", border: "1px solid rgba(0,0,0,0.15)" }}>
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}

const wrap = {
  minHeight: "calc(100vh - 56px)",
  paddingTop: 56, // so it doesn't hide behind your fixed nav
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "80px 16px 40px",
  background:
    "linear-gradient(135deg, rgba(64, 195, 255, 0.85), rgba(189, 70, 255, 0.85))",
};

const card = {
  width: "100%",
  maxWidth: 720,
  background: "white",
  borderRadius: 16,
  padding: "28px 26px",
  boxShadow: "0 18px 55px rgba(0,0,0,0.22)",
};

const btn = {
  textDecoration: "none",
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 999,
  fontWeight: 800,
  color: "white",
  background: "linear-gradient(90deg, #3dd5f3, #b14dff)",
};
