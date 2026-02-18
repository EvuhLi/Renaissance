import React, { useEffect, useRef, useState } from "react";

const NetworkCanvas = ({
  nodes,
  links,
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
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  // Set up non-passive wheel listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.5, Math.min(3, scale * zoomFactor));
      onPanZoom?.({
        pan,
        scale: newScale,
      });
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [scale, pan, onPanZoom]);

  // Draw the network
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes || nodes.length === 0) {
      console.log("Canvas not ready:", { canvas: !!canvas, nodes: nodes?.length });
      return;
    }

    console.log("Drawing canvas with nodes:", nodes.length);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.log("Could not get canvas context");
      return;
    }

    // Set canvas resolution for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    // Apply pan and zoom
    ctx.save();
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);

    // Draw links
    ctx.strokeStyle = "rgba(167, 139, 250, 0.2)";
    ctx.lineWidth = 1;
    let linksDrawn = 0;
    links.forEach((link) => {
      if (link.source && link.target) {
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.stroke();
        linksDrawn++;
      }
    });
    console.log("Links drawn:", linksDrawn);

    // Draw nodes
    nodes.forEach((node) => {
      const isSelected = node.id === selectedNodeId;
      const isHovered = node.id === hoveredNodeId;

      // Node circle background
      ctx.fillStyle = isSelected
        ? "rgba(167, 139, 250, 0.4)"
        : isHovered
        ? "rgba(167, 139, 250, 0.3)"
        : "rgba(167, 139, 250, 0.1)";
      ctx.strokeStyle = isSelected
        ? "rgba(167, 139, 250, 0.8)"
        : isHovered
        ? "rgba(167, 139, 250, 0.5)"
        : "rgba(167, 139, 250, 0.3)";
      ctx.lineWidth = isSelected ? 3 : 2;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw thumbnail image if available
      if (node.post && node.post.url) {
        const thumbSize = node.radius * 0.8;
        // Store image drawing for async load
        drawImageCircle(ctx, node.post.url, node.x, node.y, thumbSize);
      }
    });
    console.log("Nodes drawn:", nodes.length);

    ctx.restore();
  }, [nodes, links, width, height, selectedNodeId, hoveredNodeId, scale, pan]);

  // Helper to draw image in circle (with fallback)
  const drawImageCircle = (ctx, imgUrl, x, y, radius) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
      ctx.restore();
    };
    img.src = imgUrl;
  };

  // Get node at point for click detection
  const getNodeAtPoint = (canvasX, canvasY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (canvasX - rect.left - pan.x) / scale;
    const y = (canvasY - rect.top - pan.y) / scale;

    for (const node of nodes) {
      const dx = node.x - x;
      const dy = node.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < node.radius) {
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
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  // Mouse up to stop dragging
  const handleMouseUp = () => {
    isDragging.current = false;
  };

  // Wheel for zoom
  const handleWheelIgnored = (e) => {
    // Handled in useEffect with proper passive: false
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        cursor: hoveredNodeId ? "pointer" : isDragging.current ? "grabbing" : "grab",
        backgroundColor: "#000",
      }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      width={width}
      height={height}
    />
  );
};

export default NetworkCanvas;
