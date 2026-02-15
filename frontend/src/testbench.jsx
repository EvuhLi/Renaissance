import React, { useState, useRef, useEffect } from "react";

const BACKEND_URL = "http://localhost:3001"; 

const applyNoise = (ctx, width, height, intensity = 40) => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * intensity;
    data[i] = Math.min(255, Math.max(0, data[i] + noise)); 
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise)); 
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise)); 
  }
  ctx.putImageData(imageData, 0, 0);
};

const checkIsAI = async (file) => {
  try {
    const base64Image = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });
    const response = await fetch(`${BACKEND_URL}/api/check-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: base64Image }),
    });
    const result = await response.json();
    const aiScore = result.find(r => r.label.toLowerCase() === 'artificial')?.score || 0;
    return aiScore > 0.7;
  } catch (error) {
    console.error("Shield Error:", error);
    return false; 
  }
};

const TestBench = () => {
  const [originalImage, setOriginalImage] = useState(null);
  const [tiles, setTiles] = useState([]);
  const [isProtected, setIsProtected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) setIsProtected(true);
      if (e.key === "PrintScreen") {
        setIsProtected(true);
        setTimeout(() => setIsProtected(false), 1000);
      }
    };
    const handleKeyUp = (e) => { if (!e.shiftKey && !e.ctrlKey && !e.metaKey) setIsProtected(false); };
    const handleBlur = () => setIsProtected(true);
    const handleFocus = () => setIsProtected(false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsScanning(true);
    setOriginalImage(null);
    setTiles([]);
    const isAI = await checkIsAI(file);
    setIsScanning(false);
    if (isAI) {
      alert("BLOCKED: AI Generation detected.");
      return; 
    }
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      setOriginalImage(img);
      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = img.width; fullCanvas.height = img.height;
      const fullCtx = fullCanvas.getContext("2d");
      fullCtx.drawImage(img, 0, 0);
      applyNoise(fullCtx, img.width, img.height, 40);
      const rows = 3, cols = 3;
      const tileW = img.width / cols, tileH = img.height / rows;
      const newTiles = [];
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");
      tempCanvas.width = tileW; tempCanvas.height = tileH;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          tempCtx.clearRect(0, 0, tileW, tileH);
          tempCtx.drawImage(fullCanvas, c * tileW, r * tileH, tileW, tileH, 0, 0, tileW, tileH);
          newTiles.push({ row: r, col: c, src: tempCanvas.toDataURL(), x: c * tileW, y: r * tileH, w: tileW, h: tileH });
        }
      }
      setTiles(newTiles);
    };
  };

  useEffect(() => {
    if (!canvasRef.current || tiles.length === 0 || !originalImage) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = originalImage.width; canvas.height = originalImage.height;
    tiles.forEach((tile) => {
      const img = new Image();
      img.src = tile.src;
      img.onload = () => ctx.drawImage(img, tile.x, tile.y, tile.w, tile.h);
    });
  }, [tiles, originalImage]);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", backgroundColor: "#f4ecd8", minHeight: "100vh" }}>
      <h1>LOOM Protection Test Bench</h1>
      <div style={{ marginBottom: "20px", padding: "15px", border: "1px solid #d4c5b0", background: "#fff" }}>
        <input type="file" onChange={handleImageUpload} accept="image/*" disabled={isScanning} />
        {isScanning && <span style={{ marginLeft: "10px", color: "#d4af37", fontWeight: "bold" }}>✨ Scanning...</span>}
      </div>

      <div style={{ position: "relative", display: "inline-block", border: "5px solid #d4af37", lineHeight: 0 }}>
        {/* THE VISIBLE ART */}
        <canvas 
          ref={canvasRef} 
          style={{ 
            display: "block", 
            width: "100%", 
            height: "auto", 
            filter: isProtected ? "blur(30px)" : "none",
            transition: "filter 0.1s ease-out"
          }} 
        />

        {/* THE "GHOST" OVERLAY (Blocks Right-Click & Drags) */}
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            alert("🛡️ LOOM PROTOCOL: Image export is restricted to protect human artists.");
          }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            zIndex: 10,
            cursor: "not-allowed",
            // Invisible gif to trick "Save As" attempts
            backgroundImage: 'url("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")'
          }}
        />

        {/* SCREENSHOT ALERT BOX */}
        {isProtected && (
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "2rem", background: "rgba(0,0,0,0.6)", zIndex: 20 }}>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestBench;