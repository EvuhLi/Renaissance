import { Link } from "react-router-dom";
import "./App.css";

export default function LoginPage() {
  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      {/* Full-screen fixed background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background:
            "linear-gradient(135deg, rgba(64, 195, 255, 0.90), rgba(189, 70, 255, 0.90))",
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
            maxWidth: "420px",
            background: "white",
            borderRadius: "16px",
            padding: "34px 28px",
            boxShadow: "0 18px 55px rgba(0,0,0,0.22)",
          }}
        >
          <h2 style={{ textAlign: "center", margin: "0 0 18px" }}>Login</h2>

          <label style={labelStyle}>Username</label>
          <input placeholder="Type your username" style={inputStyle} />

          <div style={{ height: 14 }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label style={labelStyle}>Password</label>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              style={{ fontSize: 12, color: "#7c3aed", textDecoration: "none" }}
            >
              Forgot password?
            </a>
          </div>

          <input type="password" placeholder="Type your password" style={inputStyle} />

          {/* Fake login -> profile */}
          <Link to="/profile" style={{ textDecoration: "none" }}>
            <button style={loginBtnStyle}>LOGIN</button>
          </Link>

          <div style={{ textAlign: "center", marginTop: 16, color: "#777", fontSize: 12 }}>
            Or Sign Up Using
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 10 }}>
            <SocialCircle label="f" />
            <SocialCircle label="👁" />
            <SocialCircle label="G" />
          </div>

          <div style={{ textAlign: "center", marginTop: 18, color: "#777", fontSize: 12 }}>
            Or go back
          </div>

          <div style={{ textAlign: "center", marginTop: 8 }}>
            <Link to="/" style={{ color: "#111", fontWeight: 800, textDecoration: "none" }}>
              HOME
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 12,
  color: "#666",
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  fontSize: 14,
  boxSizing: "border-box",
};

const loginBtnStyle = {
  width: "100%",
  marginTop: 18,
  border: "none",
  borderRadius: "999px",
  padding: "12px 14px",
  fontWeight: 800,
  color: "white",
  cursor: "pointer",
  background: "linear-gradient(90deg, #3dd5f3, #b14dff)",
  boxShadow: "0 10px 18px rgba(177, 77, 255, 0.25)",
};

function SocialCircle({ label }) {
  return (
    <button
      onClick={(e) => e.preventDefault()}
      style={{
        width: 36,
        height: 36,
        borderRadius: "999px",
        border: "1px solid rgba(0,0,0,0.12)",
        background: "white",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
      }}
      aria-label={`Continue with ${label}`}
      title={`Continue with ${label}`}
    >
      {label}
    </button>
  );
}