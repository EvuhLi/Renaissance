import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import "./App.css";
import collageBg from "./assets/collage.jpg";

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
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
          captchaToken,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.user) {
        localStorage.setItem("username", data.user.username);
        localStorage.setItem("accountId", data.user.id || "");
        localStorage.setItem("role", data.user.role || "user");
        if (data.user.adminToken) localStorage.setItem("adminToken", data.user.adminToken);
        else localStorage.removeItem("adminToken");
        window.dispatchEvent(new Event("accountIdChanged"));

        if (data.user.role === "admin") {
          navigate("/admin");
          return;
        }

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
    <div style={styles.page}>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght;500;700;800&family=Playfair+Display:wght;700&display=swap');

          .auth-bottom-link {
            position: relative;
            transition: color 0.2s ease, transform 0.2s ease;
          }

          .auth-bottom-link::after {
            content: "";
            position: absolute;
            left: 0;
            bottom: -2px;
            width: 100%;
            height: 1px;
            background: #A63D3D;
            transform: scaleX(0);
            transform-origin: left;
            transition: transform 0.2s ease;
          }

          .auth-bottom-link:hover {
            color: #A63D3D;
            transform: translateY(-1px);
          }

          .auth-bottom-link:hover::after {
            transform: scaleX(1);
          }
        `}
      </style>

      <div style={styles.bgTexture} />

      <main style={styles.main}>
        <section style={styles.card}>
          <p style={styles.kicker}>LOOM ACCOUNT</p>
          <h1 style={styles.title}>Welcome back</h1>
          <p style={styles.subtitle}>Log in to continue sharing and protecting human-made art.</p>

          <label style={styles.label}>Username</label>
          <input
            placeholder="Type your username"
            style={inputStyle}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label style={styles.label}>Password</label>
          <input
            type="password"
            placeholder="Type your password"
            style={inputStyle}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {siteKey && (
            <div style={styles.captchaWrap}>
              <ReCAPTCHA sitekey={siteKey} onChange={onCaptchaChange} />
            </div>
          )}

          <button onClick={handleLogin} style={styles.primaryButton}>
            LOG IN
          </button>

          <div style={styles.metaText}>Don&apos;t have an account?</div>
          <Link to="/signup" className="auth-bottom-link" style={styles.linkCta}>
            CREATE ACCOUNT
          </Link>

          <div style={styles.metaText}>Or go back</div>
          <Link to="/" className="auth-bottom-link" style={styles.linkCta}>
            HOME
          </Link>
        </section>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "calc(100vh - 52px)",
    position: "relative",
    overflow: "hidden",
    background: "#FFFBF3",
  },
  bgTexture: {
    position: "absolute",
    inset: 0,
    backgroundImage: `linear-gradient(rgba(255, 251, 243, 0.88), rgba(255, 251, 243, 0.88)), url(${collageBg})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: "saturate(0.4)",
  },
  main: {
    position: "relative",
    zIndex: 2,
    minHeight: "calc(100vh - 52px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 16px",
  },
  card: {
    width: "100%",
    maxWidth: "470px",
    background: "rgba(249, 246, 238, 0.95)",
    border: "1px solid rgba(45, 27, 27, 0.2)",
    boxShadow: "0 24px 60px rgba(45, 27, 27, 0.18)",
    padding: "32px 28px",
    borderRadius: "14px",
    backdropFilter: "blur(2px)",
  },
  kicker: {
    margin: 0,
    fontFamily: "Inter, sans-serif",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.14em",
    color: "#7A5A48",
  },
  title: {
    margin: "8px 0 10px",
    fontFamily: "Playfair Display, serif",
    fontSize: "38px",
    lineHeight: 1.05,
    color: "#2D1B1B",
  },
  subtitle: {
    margin: "0 0 20px",
    fontFamily: "Inter, sans-serif",
    fontSize: "13px",
    lineHeight: 1.5,
    color: "#5E4A3F",
  },
  label: {
    display: "block",
    marginTop: "12px",
    marginBottom: "6px",
    fontFamily: "Inter, sans-serif",
    fontSize: "12px",
    fontWeight: 600,
    color: "#5E4A3F",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  captchaWrap: {
    marginTop: 18,
    display: "flex",
    justifyContent: "center",
  },
  primaryButton: {
    width: "100%",
    marginTop: 16,
    border: "1px solid #2D1B1B",
    borderRadius: "999px",
    padding: "12px 14px",
    fontFamily: "Inter, sans-serif",
    fontWeight: 800,
    letterSpacing: "0.09em",
    color: "#FFFBF3",
    cursor: "pointer",
    background: "#2D1B1B",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    boxShadow: "0 8px 20px rgba(45, 27, 27, 0.22)",
  },
  metaText: {
    textAlign: "center",
    marginTop: 16,
    color: "#7A6A60",
    fontSize: 12,
    fontFamily: "Inter, sans-serif",
  },
  linkCta: {
    display: "block",
    textAlign: "center",
    marginTop: 8,
    color: "#2D1B1B",
    fontFamily: "Inter, sans-serif",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textDecoration: "none",
  },
};

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(45, 27, 27, 0.2)",
  background: "#FFFDF9",
  outline: "none",
  fontFamily: "Inter, sans-serif",
  fontSize: 14,
  color: "#2D1B1B",
};
