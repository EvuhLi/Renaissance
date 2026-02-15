import { Link } from "react-router-dom";
import "./App.css";
import bg from "./assets/landingpagebackground.jpg";

export default function LandingPage() {
  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      {/* Full-screen fixed background (cannot be boxed by parent padding) */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          backgroundImage: `url(${bg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Page content */}
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "96px 16px 40px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "920px",
            padding: "34px 24px",
            borderRadius: "22px",
            textAlign: "center",
            background: "rgba(255, 255, 255, 0.82)",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 14px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "linear-gradient(135deg, #ff6aa2, #7c7cff)",
                boxShadow: "0 0 0 4px rgba(124,124,255,0.12)",
              }}
            />
            <span style={{ fontSize: 13, color: "#444" }}>Welcome to LOOM ✨</span>
          </div>

          <h1 style={{ margin: "14px 0 8px", fontSize: 46, letterSpacing: "-0.6px" }}>
            LOOM
          </h1>

          <p style={{ margin: "0 auto", color: "#444", lineHeight: 1.7, maxWidth: "62ch" }}>
            A cozy little place to share posts and view your profile.
          </p>

          <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
            <Link
              to="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 24px",
                borderRadius: "999px",
                textDecoration: "none",
                fontWeight: 800,
                letterSpacing: "0.2px",
                color: "white",
                background: "linear-gradient(90deg, #3dd5f3, #b14dff)",
                boxShadow: "0 12px 22px rgba(177, 77, 255, 0.25)",
              }}
            >
              Get Started&nbsp;→
            </Link>
          </div>

          <div style={{ marginTop: 18, fontSize: 12, color: "#666" }}>
            Click Get Started to login.
          </div>
        </div>
      </div>
    </div>
  );
}