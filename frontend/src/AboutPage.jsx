import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import missionImg from "./assets/mission.jpg"; // src/assets/mission.jpg

export default function AboutZineScrollPage() {
  const slides = useMemo(
    () => [
      {
        layout: "bg",
        kicker: "ABOUT LOOM",
        title: "Human art, not training data.",
        body:
          "We are four freshmen at Carnegie Mellon University — Jenny, Arlene, Shreya, and Eva — building an artist-centered space that prioritizes human creativity over automated extraction.",
        bgImage: missionImg,
        tag: "Mission",
        accent: "pink",
      },
      {
        layout: "split",
        kicker: "TECH FEATURE 01",
        title: "CAPTCHAs to block bots.",
        body:
          "CAPTCHA verification reduces automated signups and bot-driven scraping behavior.",
        image: missionImg,
        tag: "Anti-bot",
        accent: "cyan",
      },
      {
        layout: "shapes",
        kicker: "TECH FEATURE 02",
        title: "Canvas-based rendering.",
        body:
          "Artworks can be drawn into a canvas instead of being served as raw downloadable files.",
        tag: "Canvas",
        accent: "violet",
      },
      {
        layout: "collage",
        kicker: "TECH FEATURE 03",
        title: "Grid-splitting artwork.",
        body:
          "Segmenting images into tiles makes automated scraping and dataset collection more difficult.",
        imageA: missionImg,
        imageB: missionImg,
        tag: "Grid",
        accent: "lime",
      },
      {
        layout: "bg",
        kicker: "TECH FEATURE 04",
        title: "Friction against downloads.",
        body:
          "We discourage right-click downloading and simple extraction paths (not perfect, but raises friction).",
        bgImage: missionImg,
        tag: "Friction",
        accent: "orange",
      },
      {
        layout: "shapes",
        kicker: "TECH FEATURE 05",
        title: "Adversarial perturbations.",
        body:
          "Low-amplitude, high-frequency pixel changes can be imperceptible to humans while degrading some AI feature extraction.",
        tag: "Perturbation",
        accent: "cyan",
      },
      {
        layout: "split",
        kicker: "INSPIRED BY ARTIST TOOLS",
        title: "Nightshade/Glaze-style defense.",
        body:
          "Inspired by artist-protection tools, we explore subtle perturbations that reduce how useful scraped images are for AI training. This isn’t encryption — it’s a deterrent against unauthorized model training.",
        image: missionImg,
        tag: "Nightshade/Glaze",
        accent: "pink",
      },
      {
        layout: "collage",
        kicker: "TECH FEATURE 06",
        title: "AI-art detection.",
        body:
          "We can integrate AI image detection APIs to help flag AI-generated content and support transparency.",
        imageA: missionImg,
        imageB: missionImg,
        tag: "Detection",
        accent: "violet",
      },
    ],
    []
  );

  const scrollerRef = useRef(null);
  const sectionRefs = useRef([]);
  const [active, setActive] = useState(0);

  // Track active slide for dots/progress + trigger "active" animation
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const obs = new IntersectionObserver(
      (entries) => {
        // pick most visible entry
        let best = null;
        for (const e of entries) {
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        }
        if (best && best.isIntersecting) {
          const idx = Number(best.target.getAttribute("data-idx"));
          if (!Number.isNaN(idx)) setActive(idx);
        }
      },
      { root, threshold: [0.35, 0.5, 0.65, 0.8, 0.95] }
    );

    sectionRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const jumpTo = (idx) => {
    const el = sectionRefs.current[idx];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const palette = palettes[slides[active]?.accent] || palettes.pink;

  return (
    <div style={{ ...page, background: palette.bg }}>
      <TopNav />

      <div ref={scrollerRef} style={scroller}>
        {slides.map((s, idx) => {
          const pal = palettes[s.accent] || palettes.pink;
          const isActive = idx === active;

          return (
            <section
              key={idx}
              data-idx={idx}
              ref={(el) => (sectionRefs.current[idx] = el)}
              style={{ ...section, background: pal.bg }}
            >
              <Aurora palette={pal} />

              <div style={contentWrap}>
                <Slide s={s} palette={pal} active={isActive} />
              </div>
            </section>
          );
        })}
      </div>

      <div style={{ ...hintBar, borderColor: palette.line }}>
        Scroll to continue <span style={scrollIcon}>⌄</span>
      </div>

      <div style={{ ...miniProgress, borderColor: palette.line }}>
        <span style={{ fontWeight: 900 }}>{slides[active]?.tag}</span>
        <span style={{ opacity: 0.7, marginLeft: 10 }}>
          {active + 1} / {slides.length}
        </span>
      </div>

      <Dots total={slides.length} active={active} onJump={jumpTo} palette={palette} />
    </div>
  );
}

/* ------------------ SLIDES ------------------ */

function Slide({ s, palette, active }) {
  if (s.layout === "bg") return <SlideBG s={s} palette={palette} active={active} />;
  if (s.layout === "shapes") return <SlideShapes s={s} palette={palette} active={active} />;
  if (s.layout === "collage") return <SlideCollage s={s} palette={palette} active={active} />;
  return <SlideSplit s={s} palette={palette} active={active} />;
}

function AnimateBox({ active, style, children }) {
  // simple “scroll reveal”: when active -> opacity 1, translate 0, blur 0
  return (
    <div
      style={{
        ...style,
        opacity: active ? 1 : 0,
        transform: active ? "translateY(0px)" : "translateY(28px)",
        filter: active ? "blur(0px)" : "blur(6px)",
        transition: "opacity 650ms ease, transform 650ms ease, filter 650ms ease",
      }}
    >
      {children}
    </div>
  );
}

function SlideSplit({ s, palette, active }) {
  return (
    <div style={splitGrid}>
      <AnimateBox active={active} style={{ ...textCard, borderColor: palette.line }}>
        <div style={{ ...kicker, color: palette.kicker }}>{s.kicker}</div>
        <div style={{ ...title, color: palette.title }}>{s.title}</div>
        <div style={{ ...body, color: palette.body }}>{s.body}</div>
      </AnimateBox>

      <AnimateBox active={active} style={rightCol}>
        <div style={{ ...imageFrame, borderColor: palette.line }}>
          <div style={{ ...image, backgroundImage: `url(${s.image || s.bgImage})` }} />
          <div style={{ ...imageOverlay, background: palette.overlay }} />
          <Sticker palette={palette} />
        </div>
      </AnimateBox>
    </div>
  );
}

function SlideBG({ s, palette, active }) {
  return (
    <div style={oneFrame}>
      <div style={{ ...bgFull, backgroundImage: `url(${s.bgImage})` }}>
        <div style={{ ...bgTint, background: palette.bgTint }} />
        <div style={bgVignette} />
      </div>

      <AnimateBox active={active} style={{ ...floatCard, borderColor: "rgba(255,255,255,0.25)" }}>
        <div style={{ ...kicker, color: "rgba(255,255,255,0.85)" }}>{s.kicker}</div>
        <div style={{ ...title, color: "white" }}>{s.title}</div>
        <div style={{ ...body, color: "rgba(255,255,255,0.86)" }}>{s.body}</div>
      </AnimateBox>

      <Tape palette={palette} />
    </div>
  );
}

function SlideShapes({ s, palette, active }) {
  return (
    <div style={oneFrame}>
      <div style={shapeField}>
        <div style={{ ...blob, ...blobA, background: palette.blobA }} />
        <div style={{ ...blob, ...blobB, background: palette.blobB }} />
        <div style={{ ...blob, ...blobC, background: palette.blobC }} />
        <div style={{ ...scribble, borderColor: palette.line }} />
        <div style={{ ...scribble2, borderColor: palette.line }} />
        <div style={{ ...gridLines, backgroundImage: palette.grid }} />
      </div>

      <AnimateBox active={active} style={{ ...floatCard, borderColor: palette.line }}>
        <div style={{ ...kicker, color: palette.kicker }}>{s.kicker}</div>
        <div style={{ ...title, color: palette.title }}>{s.title}</div>
        <div style={{ ...body, color: palette.body }}>{s.body}</div>
      </AnimateBox>

      <Tape palette={palette} />
    </div>
  );
}

function SlideCollage({ s, palette, active }) {
  return (
    <div style={oneFrame}>
      <AnimateBox active={active} style={collageWrap}>
        <div style={{ ...panel, ...panelA, borderColor: palette.line }}>
          <div style={{ ...panelImg, backgroundImage: `url(${s.imageA})` }} />
        </div>
        <div style={{ ...panel, ...panelB, borderColor: palette.line }}>
          <div style={{ ...panelImg, backgroundImage: `url(${s.imageB})` }} />
        </div>
        <div style={{ ...panel, ...panelC, borderColor: palette.line }}>
          <div style={{ ...panelImg, backgroundImage: `url(${s.imageA})` }} />
        </div>
      </AnimateBox>

      <AnimateBox active={active} style={{ ...floatCard, borderColor: palette.line }}>
        <div style={{ ...kicker, color: palette.kicker }}>{s.kicker}</div>
        <div style={{ ...title, color: palette.title }}>{s.title}</div>
        <div style={{ ...body, color: palette.body }}>{s.body}</div>
      </AnimateBox>

      <Tape palette={palette} />
    </div>
  );
}

/* ------------------ DECOR ------------------ */

function Aurora({ palette }) {
  return (
    <>
      <div style={{ ...auroraA, background: palette.auroraA }} />
      <div style={{ ...auroraB, background: palette.auroraB }} />
      <div style={{ ...auroraC, background: palette.auroraC }} />
      <div style={grain} />
    </>
  );
}

function Tape({ palette }) {
  return (
    <div style={{ ...tape, borderColor: palette.line }}>
      <div style={{ ...tapeInner, background: palette.tape }} />
    </div>
  );
}

function Sticker({ palette }) {
  return (
    <div style={{ ...sticker, borderColor: palette.line, color: palette.title }}>
      LOOM
    </div>
  );
}

/* ------------------ NAV + DOTS ------------------ */

function TopNav() {
  return (
    <div style={nav}>
      <div style={navLeft}>
        <Link to="/" style={navLink}>
          HOME
        </Link>
        <Link to="/collection" style={navLink}>
          COLLECTION
        </Link>
      </div>
      <div style={brand}>loom</div>
      <div style={navRight}>
        <Link to="/about" style={{ ...navLink, opacity: 1 }}>
          ABOUT
        </Link>
        <Link to="/login" style={navLink}>
          LOGIN
        </Link>
      </div>
    </div>
  );
}

function Dots({ total, active, onJump, palette }) {
  return (
    <div style={{ ...dotsWrap, borderColor: palette.line }}>
      {Array.from({ length: total }).map((_, idx) => (
        <button
          key={idx}
          onClick={() => onJump(idx)}
          style={{
            ...dot,
            background: palette.dot,
            opacity: idx === active ? 1 : 0.35,
            transform: idx === active ? "scale(1.25)" : "scale(1)",
          }}
          aria-label={`Go to slide ${idx + 1}`}
        />
      ))}
    </div>
  );
}

/* ------------------ COLORS ------------------ */

const palettes = {
  pink: {
    bg: "linear-gradient(135deg, #ffd6e7 0%, #c7b6ff 35%, #a6f6ff 70%, #fff3b0 100%)",
    title: "rgba(10,10,20,0.92)",
    body: "rgba(10,10,20,0.78)",
    kicker: "rgba(10,10,20,0.65)",
    line: "rgba(0,0,0,0.10)",
    overlay:
      "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.18) 100%)",
    bgTint:
      "linear-gradient(120deg, rgba(255,0,180,0.35), rgba(0,220,255,0.22), rgba(255,255,255,0.0))",
    auroraA:
      "radial-gradient(circle at 30% 30%, rgba(255,0,150,0.35), rgba(255,255,255,0) 60%)",
    auroraB:
      "radial-gradient(circle at 30% 30%, rgba(0,200,255,0.30), rgba(255,255,255,0) 62%)",
    auroraC:
      "radial-gradient(circle at 30% 30%, rgba(0,255,170,0.22), rgba(255,255,255,0) 65%)",
    blobA:
      "radial-gradient(circle at 30% 30%, rgba(255,80,200,0.55), rgba(255,255,255,0) 65%)",
    blobB:
      "radial-gradient(circle at 30% 30%, rgba(0,220,255,0.45), rgba(255,255,255,0) 65%)",
    blobC:
      "radial-gradient(circle at 30% 30%, rgba(255,230,120,0.45), rgba(255,255,255,0) 70%)",
    grid:
      "linear-gradient(rgba(0,0,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.07) 1px, transparent 1px)",
    tape: "linear-gradient(90deg, rgba(255,255,255,0.55), rgba(255,255,255,0.20))",
    dot: "rgba(10,10,20,0.75)",
  },
  cyan: {
    bg: "linear-gradient(135deg, #b7fff3 0%, #a6d3ff 40%, #ffb6d5 80%, #fff2b6 100%)",
    title: "rgba(10,10,20,0.92)",
    body: "rgba(10,10,20,0.78)",
    kicker: "rgba(10,10,20,0.65)",
    line: "rgba(0,0,0,0.10)",
    overlay:
      "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.18) 100%)",
    bgTint:
      "linear-gradient(120deg, rgba(0,220,255,0.35), rgba(120,140,255,0.22), rgba(255,255,255,0.0))",
    auroraA:
      "radial-gradient(circle at 30% 30%, rgba(0,220,255,0.33), rgba(255,255,255,0) 60%)",
    auroraB:
      "radial-gradient(circle at 30% 30%, rgba(255,0,180,0.22), rgba(255,255,255,0) 62%)",
    auroraC:
      "radial-gradient(circle at 30% 30%, rgba(120,255,210,0.20), rgba(255,255,255,0) 65%)",
    blobA:
      "radial-gradient(circle at 30% 30%, rgba(0,220,255,0.55), rgba(255,255,255,0) 65%)",
    blobB:
      "radial-gradient(circle at 30% 30%, rgba(130,120,255,0.45), rgba(255,255,255,0) 65%)",
    blobC:
      "radial-gradient(circle at 30% 30%, rgba(255,200,120,0.45), rgba(255,255,255,0) 70%)",
    grid:
      "linear-gradient(rgba(0,0,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.07) 1px, transparent 1px)",
    tape: "linear-gradient(90deg, rgba(255,255,255,0.55), rgba(255,255,255,0.20))",
    dot: "rgba(10,10,20,0.75)",
  },
  violet: {
    bg: "linear-gradient(135deg, #c7b6ff 0%, #ffb6d5 35%, #a7f3ff 70%, #b9ffcc 100%)",
    title: "rgba(10,10,20,0.92)",
    body: "rgba(10,10,20,0.78)",
    kicker: "rgba(10,10,20,0.65)",
    line: "rgba(0,0,0,0.10)",
    overlay:
      "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.18) 100%)",
    bgTint:
      "linear-gradient(120deg, rgba(140,120,255,0.35), rgba(255,0,180,0.22), rgba(255,255,255,0.0))",
    auroraA:
      "radial-gradient(circle at 30% 30%, rgba(140,120,255,0.35), rgba(255,255,255,0) 60%)",
    auroraB:
      "radial-gradient(circle at 30% 30%, rgba(255,0,180,0.22), rgba(255,255,255,0) 62%)",
    auroraC:
      "radial-gradient(circle at 30% 30%, rgba(0,255,170,0.18), rgba(255,255,255,0) 65%)",
    blobA:
      "radial-gradient(circle at 30% 30%, rgba(140,120,255,0.55), rgba(255,255,255,0) 65%)",
    blobB:
      "radial-gradient(circle at 30% 30%, rgba(255,80,200,0.40), rgba(255,255,255,0) 65%)",
    blobC:
      "radial-gradient(circle at 30% 30%, rgba(0,220,255,0.35), rgba(255,255,255,0) 70%)",
    grid:
      "linear-gradient(rgba(0,0,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.07) 1px, transparent 1px)",
    tape: "linear-gradient(90deg, rgba(255,255,255,0.55), rgba(255,255,255,0.20))",
    dot: "rgba(10,10,20,0.75)",
  },
  lime: {
    bg: "linear-gradient(135deg, #b9ffcc 0%, #a7f3ff 35%, #c7b6ff 70%, #fff2b6 100%)",
    title: "rgba(10,10,20,0.92)",
    body: "rgba(10,10,20,0.78)",
    kicker: "rgba(10,10,20,0.65)",
    line: "rgba(0,0,0,0.10)",
    overlay:
      "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.18) 100%)",
    bgTint:
      "linear-gradient(120deg, rgba(0,255,170,0.30), rgba(0,220,255,0.18), rgba(255,255,255,0.0))",
    auroraA:
      "radial-gradient(circle at 30% 30%, rgba(0,255,170,0.30), rgba(255,255,255,0) 60%)",
    auroraB:
      "radial-gradient(circle at 30% 30%, rgba(0,200,255,0.26), rgba(255,255,255,0) 62%)",
    auroraC:
      "radial-gradient(circle at 30% 30%, rgba(255,200,120,0.18), rgba(255,255,255,0) 65%)",
    blobA:
      "radial-gradient(circle at 30% 30%, rgba(0,255,170,0.55), rgba(255,255,255,0) 65%)",
    blobB:
      "radial-gradient(circle at 30% 30%, rgba(0,220,255,0.40), rgba(255,255,255,0) 65%)",
    blobC:
      "radial-gradient(circle at 30% 30%, rgba(255,80,200,0.32), rgba(255,255,255,0) 70%)",
    grid:
      "linear-gradient(rgba(0,0,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.07) 1px, transparent 1px)",
    tape: "linear-gradient(90deg, rgba(255,255,255,0.55), rgba(255,255,255,0.20))",
    dot: "rgba(10,10,20,0.75)",
  },
  orange: {
    bg: "linear-gradient(135deg, #fff2b6 0%, #ffb6d5 35%, #a7f3ff 70%, #b9ffcc 100%)",
    title: "rgba(10,10,20,0.92)",
    body: "rgba(10,10,20,0.78)",
    kicker: "rgba(10,10,20,0.65)",
    line: "rgba(0,0,0,0.10)",
    overlay:
      "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.18) 100%)",
    bgTint:
      "linear-gradient(120deg, rgba(255,200,80,0.34), rgba(255,0,180,0.20), rgba(255,255,255,0.0))",
    auroraA:
      "radial-gradient(circle at 30% 30%, rgba(255,200,80,0.32), rgba(255,255,255,0) 60%)",
    auroraB:
      "radial-gradient(circle at 30% 30%, rgba(255,0,180,0.22), rgba(255,255,255,0) 62%)",
    auroraC:
      "radial-gradient(circle at 30% 30%, rgba(0,220,255,0.18), rgba(255,255,255,0) 65%)",
    blobA:
      "radial-gradient(circle at 30% 30%, rgba(255,200,80,0.55), rgba(255,255,255,0) 65%)",
    blobB:
      "radial-gradient(circle at 30% 30%, rgba(255,80,200,0.35), rgba(255,255,255,0) 65%)",
    blobC:
      "radial-gradient(circle at 30% 30%, rgba(0,220,255,0.32), rgba(255,255,255,0) 70%)",
    grid:
      "linear-gradient(rgba(0,0,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.07) 1px, transparent 1px)",
    tape: "linear-gradient(90deg, rgba(255,255,255,0.55), rgba(255,255,255,0.20))",
    dot: "rgba(10,10,20,0.75)",
  },
};

/* ------------------ PAGE + SCROLL ------------------ */

const page = {
  height: "100vh",
  overflow: "hidden",
  position: "relative",
};

const scroller = {
  height: "100vh",
  overflowY: "auto",
  scrollSnapType: "y mandatory",
  scrollBehavior: "smooth",
};

const section = {
  height: "100vh",
  scrollSnapAlign: "start",
  position: "relative",
  overflow: "hidden",
};

/* Content layout */
const contentWrap = {
  height: "100%",
  padding: "96px 40px 40px",
  position: "relative",
  zIndex: 2,
};

const splitGrid = {
  height: "100%",
  display: "grid",
  gridTemplateColumns: "1.05fr 1fr",
  gap: 24,
  alignItems: "center",
};

const oneFrame = {
  height: "100%",
  position: "relative",
};

const textCard = {
  maxWidth: 780,
  borderRadius: 22,
  padding: "26px 26px",
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.10)",
  boxShadow: "0 18px 55px rgba(0,0,0,0.12)",
  backdropFilter: "blur(16px)",
};

const floatCard = {
  position: "absolute",
  left: 52,
  bottom: 90,
  maxWidth: 760,
  borderRadius: 22,
  padding: "26px 26px",
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.10)",
  boxShadow: "0 18px 55px rgba(0,0,0,0.12)",
  backdropFilter: "blur(16px)",
};

const kicker = {
  fontSize: 12,
  letterSpacing: 2.4,
  opacity: 0.85,
  marginBottom: 12,
  fontWeight: 900,
};

const title = {
  fontSize: "clamp(40px, 5.5vw, 82px)",
  lineHeight: 0.95,
  fontWeight: 950,
  letterSpacing: -1.2,
  textTransform: "uppercase",
};

const body = {
  marginTop: 16,
  fontSize: 16,
  lineHeight: 1.7,
  maxWidth: 560,
};

const rightCol = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const imageFrame = {
  width: "min(560px, 42vw)",
  height: "min(660px, 62vh)",
  borderRadius: 24,
  overflow: "hidden",
  position: "relative",
  boxShadow: "0 28px 90px rgba(0,0,0,0.18)",
  border: "1px solid rgba(255,255,255,0.55)",
  background: "rgba(255,255,255,0.35)",
  backdropFilter: "blur(10px)",
};

const image = {
  position: "absolute",
  inset: 0,
  backgroundSize: "cover",
  backgroundPosition: "center",
  filter: "saturate(1.18) contrast(1.05)",
  transform: "scale(1.02)",
};

const imageOverlay = {
  position: "absolute",
  inset: 0,
};

/* BG slide */
const bgFull = {
  position: "absolute",
  inset: 0,
  backgroundSize: "cover",
  backgroundPosition: "center",
  filter: "saturate(1.25) contrast(1.05)",
};

const bgTint = { position: "absolute", inset: 0 };

const bgVignette = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(900px 520px at 20% 70%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.22) 75%)",
};

/* Shapes slide */
const shapeField = { position: "absolute", inset: 0, overflow: "hidden" };

const blob = {
  position: "absolute",
  width: 520,
  height: 520,
  borderRadius: 999,
  filter: "blur(26px)",
};

const blobA = { left: -120, top: 120, transform: "rotate(18deg)" };
const blobB = { right: -160, top: 60, transform: "rotate(-12deg)" };
const blobC = { left: "35%", bottom: -200, transform: "rotate(10deg)" };

const scribble = {
  position: "absolute",
  left: "8%",
  top: "18%",
  width: 220,
  height: 220,
  borderRadius: 999,
  border: "2px dashed rgba(0,0,0,0.18)",
  transform: "rotate(-12deg)",
  opacity: 0.55,
};

const scribble2 = {
  position: "absolute",
  right: "10%",
  bottom: "14%",
  width: 280,
  height: 160,
  borderRadius: 999,
  border: "2px dashed rgba(0,0,0,0.18)",
  transform: "rotate(9deg)",
  opacity: 0.5,
};

const gridLines = {
  position: "absolute",
  inset: 0,
  backgroundSize: "70px 70px",
  opacity: 0.22,
  mixBlendMode: "multiply",
};

/* Collage slide */
const collageWrap = { position: "absolute", inset: 0 };

const panel = {
  position: "absolute",
  borderRadius: 18,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.10)",
  boxShadow: "0 26px 70px rgba(0,0,0,0.16)",
  background: "rgba(255,255,255,0.35)",
  backdropFilter: "blur(10px)",
};

const panelImg = {
  position: "absolute",
  inset: 0,
  backgroundSize: "cover",
  backgroundPosition: "center",
  filter: "saturate(1.18) contrast(1.05)",
};

const panelA = {
  width: "34vw",
  height: "42vh",
  left: "8%",
  top: "14%",
  transform: "rotate(-6deg)",
};
const panelB = {
  width: "36vw",
  height: "46vh",
  right: "8%",
  top: "18%",
  transform: "rotate(7deg)",
};
const panelC = {
  width: "40vw",
  height: "36vh",
  left: "28%",
  bottom: "10%",
  transform: "rotate(-2deg)",
};

/* Tape + sticker */
const tape = {
  position: "absolute",
  right: 40,
  bottom: 40,
  width: 220,
  height: 34,
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  overflow: "hidden",
  transform: "rotate(-6deg)",
  boxShadow: "0 12px 24px rgba(0,0,0,0.10)",
  zIndex: 3,
};

const tapeInner = { position: "absolute", inset: 0, opacity: 0.9 };

const sticker = {
  position: "absolute",
  right: 16,
  top: 16,
  padding: "10px 12px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.10)",
  fontWeight: 950,
  letterSpacing: 1.6,
  zIndex: 3,
};

/* Aurora + grain */
const auroraA = {
  position: "absolute",
  inset: "-20% -10% auto auto",
  width: 520,
  height: 520,
  borderRadius: 999,
  filter: "blur(28px)",
  pointerEvents: "none",
  zIndex: 1,
};

const auroraB = {
  position: "absolute",
  inset: "auto auto -20% -10%",
  width: 620,
  height: 620,
  borderRadius: 999,
  filter: "blur(30px)",
  pointerEvents: "none",
  zIndex: 1,
};

const auroraC = {
  position: "absolute",
  inset: "10% auto auto 35%",
  width: 520,
  height: 520,
  borderRadius: 999,
  filter: "blur(26px)",
  pointerEvents: "none",
  zIndex: 1,
};

const grain = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"160\" height=\"160\"><filter id=\"n\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.9\" numOctaves=\"2\" stitchTiles=\"stitch\"/></filter><rect width=\"160\" height=\"160\" filter=\"url(%23n)\" opacity=\"0.10\"/></svg>')",
  mixBlendMode: "soft-light",
  opacity: 0.35,
  pointerEvents: "none",
  zIndex: 1,
};

/* Nav */
const nav = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: 64,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 28px",
  zIndex: 80,
  background: "rgba(255,255,255,0.35)",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  backdropFilter: "blur(14px)",
};

const navLeft = { display: "flex", gap: 18, alignItems: "center" };
const navRight = { display: "flex", gap: 18, alignItems: "center" };

const navLink = {
  textDecoration: "none",
  color: "rgba(10,10,20,0.75)",
  fontSize: 12,
  letterSpacing: 1.5,
  fontWeight: 800,
};

const brand = {
  fontSize: 16,
  letterSpacing: 2,
  fontWeight: 900,
  textTransform: "lowercase",
  color: "rgba(10,10,20,0.8)",
};

/* HUD */
const hintBar = {
  position: "fixed",
  left: 24,
  bottom: 22,
  zIndex: 90,
  fontSize: 12,
  letterSpacing: 0.6,
  color: "rgba(10,10,20,0.75)",
  padding: "10px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.60)",
  border: "1px solid rgba(0,0,0,0.10)",
  backdropFilter: "blur(14px)",
};

const scrollIcon = { marginLeft: 8, fontWeight: 900 };

const miniProgress = {
  position: "fixed",
  left: 24,
  top: 76,
  zIndex: 90,
  fontSize: 12,
  letterSpacing: 0.6,
  color: "rgba(10,10,20,0.78)",
  padding: "10px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.60)",
  border: "1px solid rgba(0,0,0,0.10)",
  backdropFilter: "blur(14px)",
};

const dotsWrap = {
  position: "fixed",
  bottom: 20,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  gap: 10,
  zIndex: 90,
  padding: "10px 12px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.10)",
  backdropFilter: "blur(14px)",
};

const dot = {
  width: 10,
  height: 10,
  borderRadius: 999,
  border: "none",
  cursor: "pointer",
};
