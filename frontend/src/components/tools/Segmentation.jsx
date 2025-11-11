import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Button,
  ButtonGroup,
  Slider,
  Typography,
  Box,
  IconButton,
  Tooltip,
  TextField,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Delete,
  Info,
  ContentCopy,
  Edit,
  Close,
  Save,
} from "@mui/icons-material";

const Segmentation = ({
  viewerRef,
  isElementEnabled,
  isImageLoaded,
  isSegmentationActive,
  disabled = false,
  onClose,
  segmentsProp = [],
  onSegmentsChange,
  imageIndex = 0,
}) => {
  const [activeMode, setActiveMode] = useState("2D");
  const [activeTool, setActiveTool] = useState("boundingBox");
  const [segments, setSegments] = useState([]);
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  const [radius, setRadius] = useState(7.9);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [tempBox, setTempBox] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const overlayCanvasRef = useRef(null);
  const mainCanvasRef = useRef(null);
  const draggingRef = useRef(null);
  const resizingRef = useRef(null);
  const selectedDrawingRef = useRef(null);
  const [editingSegmentId, setEditingSegmentId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editComment, setEditComment] = useState("");
  const [hoveredDrawing, setHoveredDrawing] = useState(null);
  const [selectedDrawing, setSelectedDrawing] = useState(null);
  const isMounted = useRef(false);

  // ----------------------------------------------------------------------
  // 1. Reset selection when panel opens/closes
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (isSegmentationActive) {
      // Panel opened → clear stale selection
      setSelectedDrawing(null);
      selectedDrawingRef.current = null;
    }
  }, [isSegmentationActive]);

  useEffect(() => {
    if (!isSegmentationActive && onClose) {
      // Panel closing → ensure clean state
      setSelectedDrawing(null);
      selectedDrawingRef.current = null;
    }
  }, [isSegmentationActive, onClose]);

  // ----------------------------------------------------------------------
  // 2. Safe Load: parent prop → localStorage fallback
  // ----------------------------------------------------------------------
  useEffect(() => {
    const storageKey = `segmentation_data_${imageIndex}`;

    if (
      segmentsProp &&
      segmentsProp.length > 0 &&
      JSON.stringify(segmentsProp) !== JSON.stringify(segments)
    ) {
      setSegments(segmentsProp);
      if (!activeSegmentId && segmentsProp[0]?.id) {
        setActiveSegmentId(segmentsProp[0].id);
      }
      return;
    }

    if (!isMounted.current) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.length > 0) {
            setSegments(parsed);
            if (!activeSegmentId) setActiveSegmentId(parsed[0].id);
          }
        }
      } catch (e) {
        console.error("Failed to load segments from localStorage:", e);
      }
    }
  }, [segmentsProp, imageIndex, segments, activeSegmentId]);

  // ----------------------------------------------------------------------
  // 3. Safe Persist: localStorage + notify parent
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }

    if (segments.length > 0) {
      const storageKey = `segmentation_data_${imageIndex}`;
      try {
        localStorage.setItem(storageKey, JSON.stringify(segments));
      } catch (e) {
        console.error("Failed to save segments to localStorage:", e);
      }
      onSegmentsChange?.(segments);
    }
  }, [segments, imageIndex, onSegmentsChange]);

  // ----------------------------------------------------------------------
  // 4. Canvas Setup: Overlay + Main Canvas Reference
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!viewerRef?.current) return;

    const element = viewerRef.current;
    const canvas = element.querySelector("canvas");
    if (!canvas) return;

    mainCanvasRef.current = canvas;

    if (isSegmentationActive && !overlayCanvasRef.current) {
      const overlay = document.createElement("canvas");
      overlay.width = canvas.width;
      overlay.height = canvas.height;
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "10";
      element.appendChild(overlay);
      overlayCanvasRef.current = overlay;
    }

    if (!isSegmentationActive && overlayCanvasRef.current) {
      if (element.contains(overlayCanvasRef.current)) {
        element.removeChild(overlayCanvasRef.current);
      }
      overlayCanvasRef.current = null;
    }
  }, [isSegmentationActive, viewerRef]);

  // ----------------------------------------------------------------------
  // 5. Draw on Main Canvas (Persistent After Apply)
  // ----------------------------------------------------------------------
  const drawOnMainCanvas = useCallback(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || segments.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    segments.forEach((seg) => {
      if (!seg.visible) return;
      ctx.strokeStyle = seg.color;
      ctx.fillStyle = seg.color;
      ctx.globalAlpha = seg.opacity;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      (seg.drawings || []).forEach((drawing) => {
        if (drawing.type === "brush") {
          const r = drawing.radius;
          ctx.lineWidth = r * 2;
          if (drawing.points.length === 1) {
            ctx.beginPath();
            ctx.arc(drawing.points[0].x, drawing.points[0].y, r, 0, Math.PI * 2);
            ctx.fill();
          } else if (drawing.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
            for (let i = 1; i < drawing.points.length; i++) {
              ctx.lineTo(drawing.points[i].x, drawing.points[i].y);
            }
            ctx.stroke();
          }
        } else if (drawing.type === "box") {
          ctx.lineWidth = 4;
          ctx.setLineDash([]);
          ctx.strokeRect(drawing.x, drawing.y, drawing.w, drawing.h);

          const cx = drawing.x + drawing.w / 2;
          const cy = drawing.y + drawing.h / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });

    ctx.restore();
  }, [segments]);

  useEffect(() => {
    if (!isSegmentationActive && segments.length > 0) {
      drawOnMainCanvas();
    }
  }, [isSegmentationActive, segments, drawOnMainCanvas]);

  // ----------------------------------------------------------------------
  // 6. Geometry Helpers
  // ----------------------------------------------------------------------
  const isPointInCenterHandle = (x, y, drawing) => {
    const cx = drawing.x + drawing.w / 2;
    const cy = drawing.y + drawing.h / 2;
    const handleSize = 10;
    return (
      x >= cx - handleSize / 2 &&
      x <= cx + handleSize / 2 &&
      y >= cy - handleSize / 2 &&
      y <= cy + handleSize / 2
    );
  };

  const isPointInResizeHandle = (x, y, drawing, handle) => {
    const size = 10;
    let hx, hy;
    switch (handle) {
      case "tl": hx = drawing.x; hy = drawing.y; break;
      case "tr": hx = drawing.x + drawing.w; hy = drawing.y; break;
      case "bl": hx = drawing.x; hy = drawing.y + drawing.h; break;
      case "br": hx = drawing.x + drawing.w; hy = drawing.y + drawing.h; break;
      default: return false;
    }
    return x >= hx - size / 2 && x <= hx + size / 2 && y >= hy - size / 2 && y <= hy + size / 2;
  };

  const isPointInBox = (x, y, drawing) =>
    x >= drawing.x && x <= drawing.x + drawing.w && y >= drawing.y && y <= drawing.y + drawing.h;

  const isPointNearStroke = (x, y, points, radius) => {
    const r = radius + 5;
    for (let i = 0; i < points.length - 1; i++) {
      const dist = distanceToSegment({ x, y }, points[i], points[i + 1]);
      if (dist <= r) return true;
    }
    if (points.length > 0) {
      const first = points[0];
      const last = points[points.length - 1];
      if (Math.hypot(x - first.x, y - first.y) <= r) return true;
      if (Math.hypot(x - last.x, y - last.y) <= r) return true;
    }
    return false;
  };

  const distanceToSegment = (point, v1, v2) => {
    const A = point.x - v1.x;
    const B = point.y - v1.y;
    const C = v2.x - v1.x;
    const D = v2.y - v1.y;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) { xx = v1.x; yy = v1.y; }
    else if (param > 1) { xx = v2.x; yy = v2.y; }
    else { xx = v1.x + param * C; yy = v1.y + param * D; }
    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // ----------------------------------------------------------------------
  // 7. Mouse Handlers (Now with Edit, Resize, Select)
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!isSegmentationActive || !viewerRef?.current) return;

    const element = viewerRef.current;
    const canvas = element.querySelector("canvas");
    if (!canvas) return;

    const handleMouseDown = (e) => {
      if (disabled || !activeSegmentId) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // --- 1. Check for resize handle (box only)
      if (activeTool === "boundingBox" && selectedDrawing?.type === "box") {
        const handles = ["tl", "tr", "bl", "br"];
        for (const handle of handles) {
          if (isPointInResizeHandle(x, y, selectedDrawing, handle)) {
            resizingRef.current = { drawingId: selectedDrawing.id, handle, startX: x, startY: y, original: { ...selectedDrawing } };
            return;
          }
        }
      }

      // --- 2. Check for center drag
      if (selectedDrawing && isPointInCenterHandle(x, y, selectedDrawing)) {
        setIsDragging(true);
        draggingRef.current = { drawingId: selectedDrawing.id, position: { x: selectedDrawing.x, y: selectedDrawing.y } };
        setDragOffset({ x: x - selectedDrawing.x, y: y - selectedDrawing.y });
        return;
      }

      // --- 3. Select drawing on click
      let clickedDrawing = null;
      for (const seg of segments) {
        if (!seg.visible) continue;
        for (const d of seg.drawings || []) {
          if (d.type === "box" && isPointInBox(x, y, d)) {
            clickedDrawing = { ...d, segmentId: seg.id };
            break;
          } else if (d.type === "brush" && isPointNearStroke(x, y, d.points, d.radius)) {
            clickedDrawing = { ...d, segmentId: seg.id };
            break;
          }
        }
        if (clickedDrawing) break;
      }

      if (clickedDrawing) {
        setSelectedDrawing(clickedDrawing);
        selectedDrawingRef.current = clickedDrawing;
        return;
      }

      // --- 4. Deselect if clicking empty space
      setSelectedDrawing(null);
      selectedDrawingRef.current = null;

      // --- 5. Start new drawing
      setIsDrawing(true);
      if (activeTool === "boundingBox") {
        setTempBox({ startX: x, startY: y, endX: x, endY: y });
      } else if (activeTool === "smartPaint") {
        setCurrentStroke([{ x, y }]);
      }
    };

    const handleMouseMove = (e) => {
      if (disabled || !activeSegmentId) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Hover detection
      let found = null;
      for (const seg of segments) {
        if (!seg.visible) continue;
        for (const d of seg.drawings || []) {
          if (d.type === "box" && isPointInBox(x, y, d)) {
            found = { segmentId: seg.id, drawingId: d.id, comment: seg.comment };
            break;
          } else if (d.type === "brush" && isPointNearStroke(x, y, d.points, d.radius)) {
            found = { segmentId: seg.id, drawingId: d.id, comment: seg.comment };
            break;
          }
        }
        if (found) break;
      }
      setHoveredDrawing(found);

      // Resizing
      if (resizingRef.current) {
        const { drawingId, handle, original, startX, startY } = resizingRef.current;
        const dx = x - startX;
        const dy = y - startY;

        let newX = original.x, newY = original.y, newW = original.w, newH = original.h;

        if (handle === "tl") { newX += dx; newY += dy; newW -= dx; newH -= dy; }
        else if (handle === "tr") { newY += dy; newW += dx; newH -= dy; }
        else if (handle === "bl") { newX += dx; newW -= dx; newH += dy; }
        else if (handle === "br") { newW += dx; newH += dy; }

        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        newW = Math.max(10, Math.min(newW, canvas.width - newX));
        newH = Math.max(10, Math.min(newH, canvas.height - newY));

        setSegments((prev) =>
          prev.map((s) =>
            s.id === activeSegmentId
              ? {
                  ...s,
                  drawings: s.drawings.map((d) =>
                    d.id === drawingId ? { ...d, x: newX, y: newY, w: newW, h: newH } : d
                  ),
                }
              : s
          )
        );
        return;
      }

      // Dragging
      if (isDragging && draggingRef.current) {
        let newX = x - dragOffset.x;
        let newY = y - dragOffset.y;
        const drawing = segments.find((s) => s.id === activeSegmentId)?.drawings.find((d) => d.id === draggingRef.current.drawingId);
        if (drawing) {
          newX = Math.max(0, Math.min(newX, canvas.width - drawing.w));
          newY = Math.max(0, Math.min(newY, canvas.height - drawing.h));
        }
        draggingRef.current.position = { x: newX, y: newY };
        drawAll();
        return;
      }

      // Drawing
      if (isDrawing) {
        if (activeTool === "boundingBox") {
          setTempBox((prev) => ({ ...prev, endX: x, endY: y }));
        } else if (activeTool === "smartPaint") {
          setCurrentStroke((prev) => [...prev, { x, y }]);
        }
      }
    };

    const handleMouseUp = () => {
      // Finish resize
      if (resizingRef.current) {
        resizingRef.current = null;
        return;
      }

      // Finish drag
      if (isDragging && draggingRef.current) {
        const { drawingId, position } = draggingRef.current;
        setSegments((prev) =>
          prev.map((s) =>
            s.id === activeSegmentId
              ? {
                  ...s,
                  drawings: s.drawings.map((d) =>
                    d.id === drawingId ? { ...d, x: position.x, y: position.y } : d
                  ),
                }
              : s
          )
        );
        draggingRef.current = null;
        setIsDragging(false);
        return;
      }

      // Finish drawing
      if (isDrawing) {
        if (activeTool === "boundingBox" && tempBox) {
          const minX = Math.min(tempBox.startX, tempBox.endX);
          const minY = Math.min(tempBox.startY, tempBox.endY);
          const w = Math.abs(tempBox.startX - tempBox.endX);
          const h = Math.abs(tempBox.startY - tempBox.endY);
          if (w > 0 && h > 0) {
            const boundedX = Math.max(0, Math.min(minX, canvas.width - w));
            const boundedY = Math.max(0, Math.min(minY, canvas.height - h));
            setSegments((prev) =>
              prev.map((s) =>
                s.id === activeSegmentId
                  ? {
                      ...s,
                      drawings: [
                        ...(s.drawings || []),
                        { id: Date.now(), type: "box", x: boundedX, y: boundedY, w, h },
                      ],
                    }
                  : s
              )
            );
          }
          setTempBox(null);
        } else if (activeTool === "smartPaint" && currentStroke) {
          setSegments((prev) =>
            prev.map((s) =>
              s.id === activeSegmentId
                ? {
                    ...s,
                    drawings: [
                      ...(s.drawings || []),
                      { id: Date.now(), type: "brush", points: currentStroke, radius },
                    ],
                  }
                : s
            )
          );
          setCurrentStroke(null);
        }
        setIsDrawing(false);
      }
    };

    const handleMouseLeave = () => {
      setHoveredDrawing(null);
      if (isDrawing) setIsDrawing(false);
      if (isDragging) setIsDragging(false);
      if (resizingRef.current) resizingRef.current = null;
    };

    element.addEventListener("mousedown", handleMouseDown, { passive: false });
    element.addEventListener("mousemove", handleMouseMove, { passive: false });
    element.addEventListener("mouseup", handleMouseUp, { passive: false });
    element.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      element.removeEventListener("mousedown", handleMouseDown);
      element.removeEventListener("mousemove", handleMouseMove);
      element.removeEventListener("mouseup", handleMouseUp);
      element.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [
    isSegmentationActive,
    activeTool,
    disabled,
    isDrawing,
    isDragging,
    activeSegmentId,
    radius,
    tempBox,
    currentStroke,
    dragOffset,
    segments,
    selectedDrawing,
  ]);

  // ----------------------------------------------------------------------
  // 8. Memoized drawAll (With Edit Handles)
  // ----------------------------------------------------------------------
  const drawAll = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;

    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    segments.forEach((seg) => {
      if (!seg.visible) return;
      ctx.strokeStyle = seg.color;
      ctx.fillStyle = seg.color;
      ctx.globalAlpha = seg.opacity;

      (seg.drawings || []).forEach((drawing) => {
        const isHovered = hoveredDrawing?.drawingId === drawing.id;
        const isSelected = selectedDrawing?.id === drawing.id;

        if (drawing.type === "brush") {
          const r = drawing.radius;
          if (drawing.points.length === 0) return;
          ctx.lineWidth = r * 2 + (isHovered || isSelected ? 6 : 0);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.globalAlpha = isSelected ? 0.9 : (isHovered ? 0.8 : seg.opacity);

          if (drawing.points.length === 1) {
            ctx.beginPath();
            ctx.arc(drawing.points[0].x, drawing.points[0].y, r, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
            for (let i = 1; i < drawing.points.length; i++) {
              ctx.lineTo(drawing.points[i].x, drawing.points[i].y);
            }
            ctx.stroke();
          }
        } else if (drawing.type === "box") {
          let drawX = drawing.x;
          let drawY = drawing.y;
          if (draggingRef.current && draggingRef.current.drawingId === drawing.id) {
            drawX = draggingRef.current.position.x;
            drawY = draggingRef.current.position.y;
          }
          ctx.globalAlpha = isSelected ? 0.8 : (isHovered ? 0.7 : seg.opacity);
          ctx.lineWidth = isSelected ? 6 : (isHovered ? 5 : 4);
          ctx.setLineDash(isSelected ? [5, 5] : []);
          ctx.strokeStyle = seg.color;
          ctx.beginPath();
          ctx.rect(drawX, drawY, drawing.w, drawing.h);
          ctx.stroke();

          const cx = drawX + drawing.w / 2;
          const cy = drawY + drawing.h / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fill();

          // Resize handles (only when selected)
          if (isSelected) {
            const handles = [
              { x: drawX, y: drawY },
              { x: drawX + drawing.w, y: drawY },
              { x: drawX, y: drawY + drawing.h },
              { x: drawX + drawing.w, y: drawY + drawing.h },
            ];
            ctx.fillStyle = "#fff";
            handles.forEach((h) => {
              ctx.beginPath();
              ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = seg.color;
              ctx.lineWidth = 2;
              ctx.stroke();
            });
          }
        }
      });
    });

    // Temporary drawing
    ctx.globalAlpha = 1;
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 4;
    const activeColor = segments.find((s) => s.id === activeSegmentId)?.color || "#00ff00";

    if (activeTool === "boundingBox" && tempBox) {
      const x = Math.min(tempBox.startX, tempBox.endX);
      const y = Math.min(tempBox.startY, tempBox.endY);
      const w = Math.abs(tempBox.startX - tempBox.endX);
      const h = Math.abs(tempBox.startY - tempBox.endY);
      ctx.strokeStyle = activeColor;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.stroke();
    } else if (activeTool === "smartPaint" && currentStroke) {
      const seg = segments.find((s) => s.id === activeSegmentId);
      if (!seg || currentStroke.length === 0) return;
      ctx.strokeStyle = seg.color;
      ctx.fillStyle = seg.color;
      ctx.globalAlpha = seg.opacity;
      ctx.lineWidth = radius * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (currentStroke.length === 1) {
        ctx.beginPath();
        ctx.arc(currentStroke[0].x, currentStroke[0].y, radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
        for (let i = 1; i < currentStroke.length; i++) {
          ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
        }
        ctx.stroke();
      }
    }

    // Comment tooltip
    if (hoveredDrawing?.comment) {
      const seg = segments.find((s) => s.id === hoveredDrawing.segmentId);
      const drawing = seg?.drawings.find((d) => d.id === hoveredDrawing.drawingId);
      if (!drawing) return;

      let centerX, centerY;
      if (drawing.type === "box") {
        centerX = drawing.x + drawing.w / 2;
        centerY = drawing.y + drawing.h / 2;
      } else if (drawing.type === "brush" && drawing.points.length) {
        const sum = drawing.points.reduce((a, b) => ({ x: a.x + b.x, y: a.y + b.y }), { x: 0, y: 0 });
        centerX = sum.x / drawing.points.length;
        centerY = sum.y / drawing.points.length;
      }

      if (centerX !== undefined) {
        ctx.font = "14px Arial";
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        const text = hoveredDrawing.comment;
        const padding = 8;
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = 18;
        const boxX = centerX - textWidth / 2 - padding;
        const boxY = centerY - textHeight - 20;
        const boxWidth = textWidth + padding * 2;
        const boxHeight = textHeight + padding;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        ctx.fillStyle = "#fff";
        ctx.fillText(text, boxX + padding, boxY + padding + 12);
      }
    }
  }, [
    segments,
    tempBox,
    currentStroke,
    activeTool,
    activeSegmentId,
    radius,
    hoveredDrawing,
    draggingRef,
    selectedDrawing,
  ]);

  useEffect(() => {
    if (isSegmentationActive) {
      drawAll();
    }
  }, [isSegmentationActive, drawAll]);

  // ----------------------------------------------------------------------
  // 9. Delete Selected Drawing
  // ----------------------------------------------------------------------
  const deleteSelectedDrawing = () => {
    if (!selectedDrawing) return;
    setSegments((prev) =>
      prev.map((s) =>
        s.id === activeSegmentId
          ? { ...s, drawings: s.drawings.filter((d) => d.id !== selectedDrawing.id) }
          : s
      )
    );
    setSelectedDrawing(null);
    selectedDrawingRef.current = null;
  };

  // ----------------------------------------------------------------------
  // 10. Segment Actions
  // ----------------------------------------------------------------------
  const toggleSegmentVisibility = (segmentId) => {
    setSegments((prev) =>
      prev.map((seg) => (seg.id === segmentId ? { ...seg, visible: !seg.visible } : seg))
    );
  };

  const deleteSegment = (segmentId) => {
    setSegments((prev) => {
      const filtered = prev.filter((seg) => seg.id !== segmentId);
      if (activeSegmentId === segmentId) {
        setActiveSegmentId(filtered[0]?.id ?? null);
      }
      return filtered;
    });
  };

  const clearActiveSegment = () => {
    if (!activeSegmentId) return;
    setSegments(prev =>
      prev.map(s =>
        s.id === activeSegmentId ? { ...s, drawings: [] } : s
      )
    );
    setSelectedDrawing(null);
    selectedDrawingRef.current = null;
  };

  const addNewSegment = () => {
    const maxId = segments.length ? Math.max(...segments.map((s) => s.id)) : 0;
    const colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24", "#f0932b"];
    const newSeg = {
      id: maxId + 1,
      name: `Smart Paint ${maxId + 1}`,
      visible: true,
      color: colors[maxId % colors.length],
      opacity: 0.5,
      drawings: [],
      comment: "",
    };
    setSegments((prev) => [...prev, newSeg]);
    setActiveSegmentId(newSeg.id);
  };

  const duplicateSegment = (segmentId) => {
    const src = segments.find((s) => s.id === segmentId);
    if (!src) return;
    const maxId = Math.max(...segments.map((s) => s.id), 0);
    const copy = {
      ...src,
      id: maxId + 1,
      name: `${src.name} (Copy)`,
      drawings: src.drawings.map((d) => ({ ...d, id: Date.now() + Math.random() })),
    };
    setSegments((prev) => [...prev, copy]);
    setActiveSegmentId(copy.id);
  };

  const startEdit = (segment) => {
    setEditingSegmentId(segment.id);
    setEditName(segment.name);
    setEditComment(segment.comment || "");
  };

  const handleSaveEdit = () => {
    setSegments((prev) =>
      prev.map((seg) =>
        seg.id === editingSegmentId ? { ...seg, name: editName, comment: editComment } : seg
      )
    );
    setEditingSegmentId(null);
  };

  const handleCancelEdit = () => setEditingSegmentId(null);

  const handleApply = () => {
    onSegmentsChange?.(segments);
    onClose?.();
  };

  const clearAllSegments = () => {
    if (window.confirm("Delete **all** segments? This cannot be undone.")) {
      setSegments([]);
      setActiveSegmentId(null);
      setSelectedDrawing(null);
      selectedDrawingRef.current = null;
      localStorage.removeItem(`segmentation_data_${imageIndex}`);
    }
  };

  // ----------------------------------------------------------------------
  // 11. Render
  // ----------------------------------------------------------------------
  return (
    <Box
      sx={{
        position: "absolute",
        top: "80px",
        left: "20px",
        width: "320px",
        backgroundColor: "#2c2c2c",
        color: "#fff",
        borderRadius: "8px",
        padding: "16px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        zIndex: 1000,
        pointerEvents: disabled ? "none" : "auto",
        opacity: disabled ? 0.6 : 1,
        maxHeight: "80vh",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ color: "#ff6b6b", fontWeight: "bold", fontSize: "14px" }}>
          SEGMENTATION
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Help"><IconButton size="small" sx={{ color: "#fff" }}><Info fontSize="small" /></IconButton></Tooltip>
          <IconButton size="small" sx={{ color: "#fff" }} onClick={handleApply}><Close fontSize="small" /></IconButton>
        </Box>
      </Box>

      {/* Tool selection */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", gap: 1, mb: 2, backgroundColor: "#1a1a1a", borderRadius: "6px", padding: "4px" }}>
          <Button
            size="small"
            variant={activeTool === "boundingBox" ? "contained" : "outlined"}
            onClick={() => setActiveTool("boundingBox")}
            sx={{
              flex: 1,
              fontSize: "12px",
              backgroundColor: activeTool === "boundingBox" ? "#3f51b5" : "transparent",
              color: "#fff",
              border: "1px solid #555",
            }}
          >
            Bounding Box
          </Button>
          <Button
            size="small"
            variant={activeTool === "smartPaint" ? "contained" : "outlined"}
            onClick={() => setActiveTool("smartPaint")}
            sx={{
              flex: 1,
              fontSize: "12px",
              backgroundColor: activeTool === "smartPaint" ? "#3f51b5" : "transparent",
              color: "#fff",
              border: "1px solid #555",
            }}
          >
            Smart Paint
          </Button>
        </Box>

        {activeTool === "smartPaint" && (
          <Box sx={{ px: 1 }}>
            <Typography gutterBottom sx={{ fontSize: "11px", color: "#ccc" }}>
              Radius: {radius.toFixed(1)}
            </Typography>
            <Slider
              value={radius}
              onChange={(_, v) => setRadius(v)}
              min={1}
              max={30}
              step={0.1}
              size="small"
              sx={{ color: "#ff6b6b" }}
            />
          </Box>
        )}
      </Box>

      {/* 2D / 3D mode */}
      <Box sx={{ mb: 3 }}>
        <ButtonGroup
          size="small"
          sx={{
            width: "100%",
            "& .MuiButton-root": { flex: 1, fontSize: "12px", color: "#fff", border: "1px solid #555" },
          }}
        >
          <Button
            variant={activeMode === "2D" ? "contained" : "outlined"}
            onClick={() => setActiveMode("2D")}
            sx={{ backgroundColor: activeMode === "2D" ? "#ff6b6b" : "transparent" }}
          >
            2D
          </Button>
          <Button
            variant={activeMode === "3D" ? "contained" : "outlined"}
            onClick={() => setActiveMode("3D")}
            sx={{ backgroundColor: activeMode === "3D" ? "#ff6b6b" : "transparent" }}
          >
            3D
          </Button>
        </ButtonGroup>
      </Box>

      {/* Selected drawing info + delete */}
      {selectedDrawing && (
        <Box sx={{ mb: 2, p: 1, backgroundColor: "#3a3a3a", borderRadius: 1, textAlign: "center" }}>
          <Typography sx={{ fontSize: "11px", color: "#aaa" }}>
            {selectedDrawing.type === "box" ? "Box" : "Brush"} selected
          </Typography>
          <Button size="small" color="error" onClick={deleteSelectedDrawing} sx={{ mt: 0.5, fontSize: "10px" }}>
            <Delete fontSize="small" /> Delete
          </Button>
        </Box>
      )}

      {/* Segments list */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography sx={{ fontSize: "12px", color: "#ccc", fontWeight: "bold" }}>
            Segments ({segments.length})
          </Typography>
          {segments.length > 0 && (
            <Button size="small" onClick={clearAllSegments} sx={{ fontSize: "10px", color: "#ff6b6b", padding: "2px 8px" }}>
              Clear All
            </Button>
          )}
        </Box>

        {segments.length === 0 ? (
          <Box
            sx={{
              textAlign: "center",
              padding: "20px",
              backgroundColor: "#3c3c3c",
              borderRadius: "6px",
              border: "1px dashed #555",
            }}
          >
            <Typography sx={{ fontSize: "12px", color: "#999", mb: 1 }}>No segments yet</Typography>
            <Typography sx={{ fontSize: "11px", color: "#666" }}>Click "+ Add Segment" to start</Typography>
          </Box>
        ) : (
          segments.map((segment) => (
            <Box
              key={segment.id}
              onClick={() => setActiveSegmentId(segment.id)}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: segment.id === activeSegmentId ? "#4c4c4c" : "#3c3c3c",
                borderRadius: "6px",
                padding: "8px 12px",
                mb: 1,
                border: segment.id === activeSegmentId ? "2px solid #3f51b5" : "1px solid #555",
                cursor: "pointer",
                "&:hover": { backgroundColor: "#4c4c4c" },
              }}
            >
              {segment.id === editingSegmentId ? (
                <Box sx={{ display: "flex", flex: 1, gap: 1, alignItems: "center" }}>
                  <TextField
                    size="small"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    sx={{ flex: 1, input: { color: "#fff" } }}
                    InputProps={{ style: { fontSize: "12px" } }}
                  />
                  <TextField
                    size="small"
                    placeholder="Comment"
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value)}
                    sx={{ flex: 1, input: { color: "#fff" } }}
                    InputProps={{ style: { fontSize: "12px" } }}
                  />
                  <IconButton size="small" onClick={handleSaveEdit} sx={{ color: "#4caf50" }}>
                    <Save fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={handleCancelEdit} sx={{ color: "#f44336" }}>
                    <Close fontSize="small" />
                  </IconButton>
                </Box>
              ) : (
                <>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSegmentVisibility(segment.id);
                      }}
                      sx={{ color: "#fff" }}
                    >
                      {segment.visible ? <Visibility /> : <VisibilityOff />}
                    </IconButton>
                    <Box sx={{ width: 12, height: 12, backgroundColor: segment.color, borderRadius: "2px" }} />
                    <Typography sx={{ fontSize: "12px", flex: 1 }}>{segment.name}</Typography>
                    {segment.comment && (
                      <Tooltip title={segment.comment}>
                        <Info fontSize="small" sx={{ color: "#aaa" }} />
                      </Tooltip>
                    )}
                  </Box>

                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(segment);
                        }}
                        sx={{ color: "#fff" }}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Duplicate">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateSegment(segment.id);
                        }}
                        sx={{ color: "#fff" }}
                      >
                        <ContentCopy fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSegment(segment.id);
                        }}
                        sx={{ color: "#ff6b6b" }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </>
              )}
            </Box>
          ))
        )}
      </Box>

      {/* Bottom action buttons */}
      <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
        <Button
          variant="contained"
          size="small"
          onClick={addNewSegment}
          sx={{ flex: 1, backgroundColor: "#ff6b6b", fontSize: "12px" }}
        >
          + Add Segment
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={clearActiveSegment}
          disabled={!activeSegmentId}
          sx={{ flex: 1, borderColor: "#ff6b6b", color: "#ff6b6b", fontSize: "12px" }}
        >
          Clear Active
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={handleApply}
          sx={{ flex: 1, backgroundColor: "#4caf50", fontSize: "12px" }}
        >
          Apply
        </Button>
      </Box>
    </Box>
  );
};

export default Segmentation;