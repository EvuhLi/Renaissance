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

  const toWorld = (screenX, screenY) => {
    const cx = width / 2;
    const cy = height / 2;
    return {
      x: cx + (screenX - cx - pan.x) / scale,
      y: cy + (screenY - cy - pan.y) / scale,
    };
  };

  // Set up non-passive wheel listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
      const newScale = Math.max(0.5, Math.min(3, scale * zoomFactor));

      const rect = canvas.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      // Zoom around cursor so posts (not background) scale as expected.
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

      onPanZoom?.({
        pan: newPan,
        scale: newScale,
      });
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

  // Draw the network
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes || nodes.length === 0) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    // Set canvas resolution for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = "#E8E4D9";
    ctx.fillRect(0, 0, width, height);

    // Apply pan and zoom
    ctx.save();
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);

    // Draw relevance links as "strings".
    links.forEach((link) => {
      if (link.source && link.target) {
        const strength = Math.max(0.08, Math.min(1, link.strength || 0.2));
        const typeColor = linkColors[link.type] || "#6B705C";
        const alpha = Math.min(0.95, 0.26 + strength * 0.58);
        // Hex fallback with alpha support.
        const stroke = typeColor.startsWith("#")
          ? `${typeColor}${Math.round(alpha * 255)
              .toString(16)
              .padStart(2, "0")}`
          : typeColor;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.6 + strength * 2.6;
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.stroke();
      }
    });

    // Draw square nodes.
    nodes.forEach((node) => {
      const isSelected = node.id === selectedNodeId;
      const isHovered = node.id === hoveredNodeId;
      const side = node.size;
      const half = side / 2;
      const left = node.x - half;
      const top = node.y - half;
      const corner = Math.max(8, side * 0.07);

      ctx.fillStyle = isSelected
        ? "rgba(203, 153, 126, 0.34)"
        : isHovered
        ? "rgba(165, 165, 141, 0.3)"
        : "rgba(165, 165, 141, 0.2)";
      ctx.strokeStyle = isSelected
        ? "rgba(203, 153, 126, 0.95)"
        : isHovered
        ? "rgba(165, 165, 141, 0.78)"
        : "rgba(165, 165, 141, 0.55)";
      ctx.lineWidth = isSelected ? 3 : 2;

      ctx.beginPath();
      ctx.roundRect(left, top, side, side, corner);
      ctx.fill();
      ctx.stroke();

      if (node.post && node.post.url) {
        const img = imageCacheRef.current.get(node.post.url);
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(left + 3, top + 3, side - 6, side - 6, Math.max(6, corner - 2));
          ctx.clip();
          const imgRatio = img.naturalWidth / img.naturalHeight;
          const boxRatio = (side - 6) / (side - 6);
          let sx = 0;
          let sy = 0;
          let sw = img.naturalWidth;
          let sh = img.naturalHeight;
          if (imgRatio > boxRatio) {
            sw = img.naturalHeight * boxRatio;
            sx = (img.naturalWidth - sw) / 2;
          } else {
            sh = img.naturalWidth / boxRatio;
            sy = (img.naturalHeight - sh) / 2;
          }
          ctx.drawImage(
            img,
            sx,
            sy,
            sw,
            sh,
            left + 3,
            top + 3,
            side - 6,
            side - 6
          );
          ctx.restore();
        }
      }
    });

    ctx.restore();
  }, [nodes, links, width, height, selectedNodeId, hoveredNodeId, scale, pan, linkColors]);

  // Get node at point for click detection
  const getNodeAtPoint = (canvasX, canvasY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = canvasX - rect.left;
    const screenY = canvasY - rect.top;
    const { x, y } = toWorld(screenX, screenY);

    for (const node of nodes) {
      const half = node.size / 2;
      if (
        x >= node.x - half &&
        x <= node.x + half &&
        y >= node.y - half &&
        y <= node.y + half
      ) {
        return node;
      }
    }
    return null;
  };

  // Mouse move for hover
  const handleMouseMove = (e) => {
    const node = getNodeAtPoint(e.clientX, e.clientY);
    setHoveredNodeId(node ? node.id : null);
    
    if (isDragging.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      onPanZoom?.({
        pan: { x: pan.x + dx, y: pan.y + dy },
        scale,
      });
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  // Mouse down to start dragging
  const handleMouseDown = (e) => {
    const node = getNodeAtPoint(e.clientX, e.clientY);
    if (node) {
      onNodeClick?.(node);
    } else {
      isDragging.current = true;
      setIsDraggingState(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  // Mouse up to stop dragging
  const handleMouseUp = () => {
    isDragging.current = false;
    setIsDraggingState(false);
  };

  // Wheel for zoom
  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        cursor: hoveredNodeId ? "pointer" : isDraggingState ? "grabbing" : "grab",
        backgroundColor: "#E8E4D9",
      }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
      width={width}
      height={height}
    />
  );
};

export default NetworkCanvas;
