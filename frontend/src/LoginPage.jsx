import React, { useState } from "react";
import { Link } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import "./App.css";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState(null);

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  const onCaptchaChange = (token) => {
    setCaptchaToken(token);
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();

    // 0) Make sure we have a site key
    if (!siteKey) {
      alert("Missing reCAPTCHA site key. Add VITE_RECAPTCHA_SITE_KEY to frontend/.env and restart.");
      return;
    }

    // A) Check captcha
    if (!captchaToken) {
      alert("Please check the box to verify you are not a robot!");
      return;
    }

    // B) Check fields
    if (!username || !password) {
      alert("Please enter both username and password.");
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, captchaToken }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        alert("Login Successful!");
        // Optional redirect:
        // window.location.href = "/";
      } else {
        alert("Login Failed: " + (data.message || "Unknown error"));
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Something went wrong connecting to the server.");
    }
  };

  return (
    <div
      style={{
        minHeight: "calc(100vh - 52px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 16px",
        background:
          "linear-gradient(135deg, rgba(64, 195, 255, 0.85), rgba(189, 70, 255, 0.85))",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "white",
          borderRadius: "14px",
          padding: "34px 28px",
          boxShadow: "0 18px 55px rgba(0,0,0,0.22)",
        }}
      >
        <h2 style={{ textAlign: "center", margin: "0 0 20px" }}>Login</h2>

        {/* USERNAME */}
        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
          Username
        </label>
        <input
          placeholder="Type your username"
          style={inputStyle}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <div style={{ height: 14 }} />

        {/* PASSWORD */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label style={{ fontSize: 12, color: "#666" }}>Password</label>
          <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 12, color: "#7c3aed" }}>
            Forgot password?
          </a>
        </div>
        <input
          type="password"
          placeholder="Type your password"
          style={inputStyle}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* CAPTCHA */}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
          {siteKey ? (
            <ReCAPTCHA sitekey={siteKey} onChange={onCaptchaChange} />
          ) : (
            <div
              style={{
                fontSize: 12,
                color: "#b91c1c",
                background: "rgba(185, 28, 28, 0.08)",
                border: "1px solid rgba(185, 28, 28, 0.25)",
                padding: "10px 12px",
                borderRadius: 10,
                textAlign: "center",
              }}
            >
              Missing <b>VITE_RECAPTCHA_SITE_KEY</b>. Create <code>frontend/.env</code> and restart
              <code> npm run dev</code>.
            </div>
          )}
        </div>

        {/* LOGIN BUTTON */}
        <button
          onClick={handleLogin}
          style={{
            width: "100%",
            marginTop: 18,
            border: "none",
            borderRadius: "999px",
            padding: "12px 14px",
            fontWeight: 700,
            color: "white",
            cursor: "pointer",
            background: "linear-gradient(90deg, #3dd5f3, #b14dff)",
            boxShadow: "0 10px 18px rgba(177, 77, 255, 0.25)",
          }}
        >
          LOGIN
        </button>

        <div style={{ textAlign: "center", marginTop: 18, color: "#777", fontSize: 12 }}>
          Or Sign Up Using
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 10 }}>
          <SocialCircle label="f" />
          <SocialCircle label="🐦" />
          <SocialCircle label="G" />
        </div>

        <div style={{ textAlign: "center", marginTop: 22, color: "#777", fontSize: 12 }}>
          Or go back
        </div>

        <div style={{ textAlign: "center", marginTop: 8 }}>
          <Link to="/" style={{ color: "#111", fontWeight: 700, textDecoration: "none" }}>
            HOME
          </Link>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  fontSize: 14,
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