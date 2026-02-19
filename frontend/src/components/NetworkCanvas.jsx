import React, { useEffect, useRef, useState } from "react";

const NetworkCanvas = ({
  nodes,
  links,
  linkColors = {},
  width,
  height,
  onNodeClick,
  selectedNodeId,
  scale = 1,
  pan = { x: 0, y: 0 },
  onPanZoom,
}) => {
  const canvasRef = useRef(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const imageCacheRef = useRef(new Map());

  // Helper to calculate parallax position for a node
  const getParallaxPos = (node, currentPan) => {
    // Generate a consistent depth based on the node's ID (range: 0.6 to 1.4)
    // 1.0 is the "middle" ground.
    const depth = 0.6 + ((parseInt(String(node.id).slice(-2), 16) || 0) % 80) / 100;
    
    // Parallax math: (depth - 1) determines the relative shift.
    // Close objects (depth > 1) move faster than the pan.
    // Far objects (depth < 1) move slower.
    return {
      x: node.x + (currentPan.x * (depth - 1)) / scale,
      y: node.y + (currentPan.y * (depth - 1)) / scale,
      depth
    };
  };

  const toWorld = (screenX, screenY) => {
    const cx = width / 2;
    const cy = height / 2;
    return {
      x: cx + (screenX - cx - pan.x) / scale,
      y: cy + (screenY - cy - pan.y) / scale,
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const zoomIntensity = 0.08;
      const zoomFactor = e.deltaY > 0 ? (1 - zoomIntensity) : (1 + zoomIntensity);
      const newScale = Math.max(0.3, Math.min(4, scale * zoomFactor));

      const rect = canvas.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      const cx = width / 2;
      const cy = height / 2;
      const before = {
        x: cx + (pointerX - cx - pan.x) / scale,
        y: cy + (pointerY - cy - pan.y) / scale,
      };
      const newPan = {
        x: pointerX - cx - (before.x - cx) * newScale,
        y: pointerY - cy - (before.y - cy) * newScale,
      };

      onPanZoom?.({ pan: newPan, scale: newScale });
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [scale, pan, onPanZoom, width, height]);

  useEffect(() => {
    nodes.forEach((node) => {
      const url = node?.post?.url;
      if (!url || imageCacheRef.current.has(url)) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      imageCacheRef.current.set(url, img);
    });
  }, [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes || nodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#E8E4D9";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Center the camera
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);

    // Draw Links first (behind nodes)
    links.forEach((link) => {
      if (link.source && link.target) {
        // We calculate parallax for the link endpoints so they stay attached to nodes
        const p1 = getParallaxPos(link.source, pan);
        const p2 = getParallaxPos(link.target, pan);

        const strength = Math.max(0.08, Math.min(1, link.strength || 0.2));
        const typeColor = linkColors[link.type] || "#6B705C";
        ctx.strokeStyle = typeColor;
        ctx.globalAlpha = 0.2 + strength * 0.4;
        ctx.lineWidth = (1.5 + strength * 2) / scale; // Scale line weight inversely
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1.0;

    // Draw Nodes
    
    nodes.forEach((node) => {
      const { x, y, depth } = getParallaxPos(node, pan);
      const isSelected = node.id === selectedNodeId;
      const isHovered = node.id === hoveredNodeId;
      
      // Get image to determine real dimensions
      const img = node.post?.url ? imageCacheRef.current.get(node.post.url) : null;
      const hasImg = img && img.complete && img.naturalWidth > 0;

      // Calculate correct dimensions
      let nodeWidth = node.size;
      let nodeHeight = node.size;

      if (hasImg) {
        const imgRatio = img.naturalWidth / img.naturalHeight;
        if (imgRatio > 1) {
          // Landscape: Maintain width, scale down height
          nodeHeight = node.size / imgRatio;
        } else {
          // Portrait: Maintain height, scale down width
          nodeWidth = node.size * imgRatio;
        }
      }

      // Apply depth scaling to the final dimensions
      const finalW = nodeWidth * (0.8 + depth * 0.2);
      const finalH = nodeHeight * (0.8 + depth * 0.2);
      const left = x - finalW / 2;
      const top = y - finalH / 2;
      const corner = Math.max(4, Math.min(finalW, finalH) * 0.1);

      // Cool shadow effect for "closer" nodes
      if (depth > 1.1) {
        ctx.shadowColor = "rgba(0,0,0,0.1)";
        ctx.shadowBlur = 10 * depth;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 5;
      }

      ctx.fillStyle = isSelected ? "#CB997E" : isHovered ? "#A5A58D" : "#ffffff";
      ctx.strokeStyle = isSelected ? "#B56576" : "#6B705C";
      ctx.lineWidth = (isSelected ? 4 : 2) * depth;

      ctx.beginPath();
      ctx.roundRect(left, top, finalW, finalH, corner);
      ctx.fill();
      ctx.stroke();
      
      // Reset shadows for image
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      if (hasImg) {
        ctx.save();
        ctx.beginPath();
        // Match the image clip to the new rectangular dimensions
        ctx.roundRect(left + 2, top + 2, finalW - 4, finalH - 4, corner - 1);
        ctx.clip();
        
        // Draw the full image using the corrected rectangle
        ctx.drawImage(img, left + 2, top + 2, finalW - 4, finalH - 4);
        ctx.restore();
      }
    });

    ctx.restore();
  }, [nodes, links, width, height, selectedNodeId, hoveredNodeId, scale, pan, linkColors]);

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    // Check for node under mouse (accounting for parallax)
    let found = null;
    for (const node of nodes) {
      const { x, y, depth } = getParallaxPos(node, pan);
      const worldPos = toWorld(e.clientX, e.clientY);
      // We check against the parallaxed position, not the static node.x
      const side = node.size * (0.8 + depth * 0.2);
      const half = side / 2;
      
      // Check collision in world space
      const cx = width / 2;
      const cy = height / 2;
      const mouseWorldX = cx + (screenX - cx - pan.x) / scale;
      const mouseWorldY = cy + (screenY - cy - pan.y) / scale;

      if (Math.abs(mouseWorldX - x) < half && Math.abs(mouseWorldY - y) < half) {
        found = node;
        break;
      }
    }

    setHoveredNodeId(found ? found.id : null);
    
    if (isDragging.current) {
      onPanZoom?.({
        pan: { x: pan.x + (e.clientX - dragStart.current.x), y: pan.y + (e.clientY - dragStart.current.y) },
        scale,
      });
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseDown = (e) => {
    if (hoveredNodeId) {
      const node = nodes.find(n => n.id === hoveredNodeId);
      onNodeClick?.(node);
    } else {
      isDragging.current = true;
      setIsDraggingState(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        cursor: hoveredNodeId ? "pointer" : isDraggingState ? "grabbing" : "grab",
      }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={() => { isDragging.current = false; setIsDraggingState(false); }}
      onMouseLeave={() => { isDragging.current = false; setIsDraggingState(false); }}
    />
  );
};

export default NetworkCanvas;