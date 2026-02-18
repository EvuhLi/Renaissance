import React, { useState } from "react";
import { Link } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import "./App.css";

export default function SignUpPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState(null);

  const onCaptchaChange = (token) => {
    setCaptchaToken(token);
  };

  const handleSignUp = async (e) => {
    if (e) e.preventDefault();

    if (!captchaToken) {
      alert("Please check the box to verify you are not a robot!");
      return;
    }

    if (!username || !email || !password || !confirmPassword) {
      alert("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    console.log("Sending data to backend:", { username, email, password, captchaToken });

    try {
      const response = await fetch('http://localhost:5000/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          email,
          password,
          captchaToken,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert("Sign Up Successful!");
        // Redirect to login or home
        // window.location.href = "/login";
      } else {
        alert("Sign Up Failed: " + data.message);
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
        <h2 style={{ textAlign: "center", margin: "0 0 20px" }}>Sign Up</h2>

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

        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
          Email
        </label>
        <input
          type="email"
          placeholder="Type your email"
          style={inputStyle}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div style={{ height: 14 }} />

        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
          Password
        </label>
        <input
          type="password"
          placeholder="Type your password"
          style={inputStyle}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div style={{ height: 14 }} />

        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
          Confirm Password
        </label>
        <input
          type="password"
          placeholder="Confirm your password"
          style={inputStyle}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
          <ReCAPTCHA
            sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}
            onChange={onCaptchaChange}
          />
        </div>

        <button
          onClick={handleSignUp}
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
          SIGN UP
        </button>

        <div style={{ textAlign: "center", marginTop: 18, color: "#777", fontSize: 12 }}>
          Already have an account?
        </div>

        <div style={{ textAlign: "center", marginTop: 8 }}>
          <Link to="/login" style={{ color: "#111", fontWeight: 700, textDecoration: "none" }}>
            LOGIN
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
