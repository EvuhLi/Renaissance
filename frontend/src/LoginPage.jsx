import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import "./App.css";

const API_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState(null);

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  const onCaptchaChange = (token) => {
    setCaptchaToken(token);
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();

    if (siteKey && !captchaToken) {
      alert("Please check the box to verify you are not a robot!");
      return;
    }

    if (!username || !password) {
      alert("Please enter both username and password.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.user) {
        localStorage.setItem("username", data.user.username);
        localStorage.setItem("accountId", data.user.id || "");
        alert("Login Successful!");
        const targetProfileId = data.user.id || localStorage.getItem("accountId");
        navigate(targetProfileId ? "/profile/" + encodeURIComponent(targetProfileId) : "/profile");
      } else {
        alert("Login Failed: " + (data.error || data.message || "Unknown error"));
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

        {siteKey && (
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
            <ReCAPTCHA sitekey={siteKey} onChange={onCaptchaChange} />
          </div>
        )}

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
          Don't have an account?
        </div>

        <div style={{ textAlign: "center", marginTop: 8 }}>
          <Link to="/signup" style={{ color: "#111", fontWeight: 700, textDecoration: "none" }}>
            SIGN UP
          </Link>
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
