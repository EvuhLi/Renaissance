import React from "react";
import { Link } from "react-router-dom";
// Make sure the path matches your file structure
import logoBg from "./assets/MacBook Air - 1.png"; 

export default function LandingPage() {
  return (
    <div style={styles.pageWrapper}>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
          
          .nav-link {
            text-decoration: none;
            color: #2D1B1B;
            font-family: 'Inter', sans-serif;
            font-weight: 700;
            font-size: 14px;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            transition: all 0.2s ease;
          }
          .nav-link:hover { color: #A63D3D; }

          .get-started-btn {
            display: inline-block;
            padding: 18px 50px;
            border: 2px solid #2D1B1B;
            color: #2D1B1B;
            text-decoration: none;
            font-weight: 800;
            letter-spacing: 0.1em;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .get-started-btn:hover {
            background: #2D1B1B;
            color: #F8F5F0;
            transform: translateY(-3px);
          }
        `}
      </style>

      {/* Hero Section */}
      <main style={styles.mainContent}>
        {/* The PNG Background: Set to absolute so it scrolls with the content */}
        <div style={{
          ...styles.backgroundLayer,
          backgroundImage: `url(${logoBg})`
        }} />

        <div style={styles.ctaContainer}>
          <Link to="/login" className="get-started-btn">
            GET STARTED &nbsp; →
          </Link>
        </div>
      </main>

      {/* Adding some extra height/content below so you can see the scroll effect */}
      <section style={styles.infoSection}>
        <p style={styles.footerText}>SECURED BY SUB-PERCEPTUAL PERTURBATIONS</p>
      </section>
    </div>
  );
}

const styles = {
  pageWrapper: {
    backgroundColor: "#FFFBF3", // Parchment background
    minHeight: "150vh", // Extra height to enable scrolling
    width: "100%",
    position: "relative",
  },
  nav: {
    display: "flex",
    justifyContent: "space-between",
    padding: "40px 60px",
    position: "relative",
    zIndex: 10,
  },
  brand: {
    fontSize: "22px",
    fontWeight: "900",
    letterSpacing: "0.2em",
    color: "#2D1B1B",
  },
  navLinks: {
    display: "flex",
    gap: "40px",
  },
  mainContent: {
    position: "relative",
    height: "90vh",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    
  },
  backgroundLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 1,
    backgroundSize: "contain",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    pointerEvents: "none", // Allows clicks to pass through to the button
  },
  ctaContainer: {
    position: "relative",
    zIndex: 5,
    marginTop: "80vh", // Adjust this to move the button up or down relative to the logo
  },
  infoSection: {
    height: "50vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderTop: "1px solid rgba(45, 27, 27, 0.1)",
  },
  footerText: {
    fontSize: "12px",
    fontWeight: "800",
    letterSpacing: "0.2em",
    opacity: 0.5,
  }
};