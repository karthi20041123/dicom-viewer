import React, { useState, useEffect, useRef } from "react";
import {
  Button,
  ButtonGroup,
  Slider,
  Typography,
  Box,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Delete,
  Info,
  ContentCopy,
  Edit,
  Close,
} from "@mui/icons-material";
import * as cornerstone from "cornerstone-core";

const Segmentation = ({
  viewerRef,
  isElementEnabled,
  isImageLoaded,
  isSegmentationActive,
  disabled = false,
  onClose,
}) => {
  const [activeMode, setActiveMode] = useState("2D");
  const [activeTool, setActiveTool] = useState("boundingBox");
  const [segments, setSegments] = useState([
    {
      id: 1,
      name: "Smart Paint 1",
      visible: true,
      color: "#ff6b6b",
      opacity: 0.5,
      drawings: [],
    },
  ]);
  const [activeSegmentId, setActiveSegmentId] = useState(1);
  const [radius, setRadius] = useState(7.9);
  const [sensitivity, setSensitivity] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [tempBox, setTempBox] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const overlayCanvasRef = useRef(null);
  const draggingRef = useRef(null);

  useEffect(() => {
    if (!viewerRef?.current || !isSegmentationActive) return;

    const element = viewerRef.current;
    const canvas = element.querySelector("canvas");
    if (!canvas) return;

    if (!overlayCanvasRef.current) {
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

    const handleMouseDown = (e) => {
      if (disabled || !isSegmentationActive || !activeSegmentId) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      let foundDrawing = null;
      const activeSegment = segments.find((s) => s.id === activeSegmentId);
      if (activeSegment && activeTool === "boundingBox") {
        for (const drawing of activeSegment.drawings || []) {
          if (drawing.type === "box" && isPointInCenterHandle(x, y, drawing)) {
            foundDrawing = drawing;
            setIsDragging(true);
            draggingRef.current = {
              drawingId: drawing.id,
              position: { x: drawing.x, y: drawing.y },
            };
            setDragOffset({
              x: x - drawing.x,
              y: y - drawing.y,
            });
            return;
          }
        }
      }

      if (!foundDrawing) {
        setIsDrawing(true);
        if (activeTool === "boundingBox") {
          setTempBox({ startX: x, startY: y, endX: x, endY: y });
        } else if (activeTool === "smartPaint") {
          setCurrentStroke([{ x, y }]);
        }
      }
    };

    const handleMouseMove = (e) => {
      if (disabled || !isSegmentationActive || !activeSegmentId) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (isDragging && draggingRef.current) {
        let newX = x - dragOffset.x;
        let newY = y - dragOffset.y;
        const drawing = segments
          .find((s) => s.id === activeSegmentId)
          ?.drawings.find((d) => d.id === draggingRef.current.drawingId);

        if (drawing) {
          newX = Math.max(0, Math.min(newX, canvas.width - drawing.w));
          newY = Math.max(0, Math.min(newY, canvas.height - drawing.h));
        }

        draggingRef.current.position = { x: newX, y: newY };
        drawAll(); // redraw immediately for smooth dragging
      } else if (isDrawing) {
        if (activeTool === "boundingBox") {
          setTempBox((prev) => ({ ...prev, endX: x, endY: y }));
        } else if (activeTool === "smartPaint") {
          setCurrentStroke((prev) => [...prev, { x, y }]);
        }
      }
    };

    const handleMouseUp = () => {
      if (!activeSegmentId) {
        setIsDrawing(false);
        setIsDragging(false);
        return;
      }

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
      } else if (isDrawing) {
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

    element.addEventListener("mousedown", handleMouseDown, { passive: false });
    element.addEventListener("mousemove", handleMouseMove, { passive: false });
    element.addEventListener("mouseup", handleMouseUp, { passive: false });

    return () => {
      element.removeEventListener("mousedown", handleMouseDown);
      element.removeEventListener("mousemove", handleMouseMove);
      element.removeEventListener("mouseup", handleMouseUp);
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
  ]);

  useEffect(() => {
    drawAll();
  }, [segments, tempBox, currentStroke, isDrawing, isDragging, activeTool, activeSegmentId, radius]);

  const drawAll = () => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Draw persistent segments
    segments.forEach((seg) => {
      if (!seg.visible) return;
      ctx.strokeStyle = seg.color;
      ctx.fillStyle = seg.color;
      ctx.globalAlpha = seg.opacity;
      (seg.drawings || []).forEach((drawing) => {
        if (drawing.type === "brush") {
          const drawRadius = drawing.radius;
          if (drawing.points.length === 0) return;
          ctx.lineWidth = drawRadius * 2;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          if (drawing.points.length === 1) {
            ctx.beginPath();
            ctx.arc(drawing.points[0].x, drawing.points[0].y, drawRadius, 0, 2 * Math.PI);
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
          ctx.beginPath();
          ctx.rect(drawX, drawY, drawing.w, drawing.h);
          ctx.lineWidth = 4;
          ctx.setLineDash([]);
          ctx.stroke();

          // Center point
          const cx = drawX + drawing.w / 2;
          const cy = drawY + drawing.h / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
          ctx.fill();

          // Line to bottom-right corner
          const cornerX = drawX + drawing.w;
          const cornerY = drawY + drawing.h;
          ctx.beginPath();
          ctx.moveTo(cornerX, cornerY);
          ctx.lineTo(cx, cy);
          ctx.lineWidth = 4;
          ctx.stroke();
        }
      });
    });

    // Draw temporary drawings
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
      const activeSeg = segments.find((s) => s.id === activeSegmentId);
      if (!activeSeg || currentStroke.length === 0) return;
      ctx.strokeStyle = activeSeg.color;
      ctx.fillStyle = activeSeg.color;
      ctx.globalAlpha = activeSeg.opacity;
      ctx.lineWidth = radius * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (currentStroke.length === 1) {
        ctx.beginPath();
        ctx.arc(currentStroke[0].x, currentStroke[0].y, radius, 0, 2 * Math.PI);
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
  };

  const toggleSegmentVisibility = (segmentId) => {
    setSegments((prev) =>
      prev.map((seg) =>
        seg.id === segmentId ? { ...seg, visible: !seg.visible } : seg
      )
    );
  };

  const deleteSegment = (segmentId) => {
    setSegments((prev) => {
      const newSegments = prev.filter((seg) => seg.id !== segmentId);
      if (activeSegmentId === segmentId && newSegments.length > 0) {
        setActiveSegmentId(newSegments[0].id);
      } else if (newSegments.length === 0) {
        setActiveSegmentId(null);
      }
      return newSegments;
    });
  };

  const clearActiveSegment = () => {
    if (!activeSegmentId) return;
    setSegments((prev) =>
      prev.map((s) =>
        s.id === activeSegmentId ? { ...s, drawings: [] } : s
      )
    );
  };

  const addNewSegment = () => {
    const newId = Math.max(...segments.map((s) => s.id), 0) + 1;
    const colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24", "#f0932b"];
    const newSegment = {
      id: newId,
      name: `Smart Paint ${newId}`,
      visible: true,
      color: colors[newId % colors.length],
      opacity: 0.5,
      drawings: [],
    };
    setSegments((prev) => [...prev, newSegment]);
    setActiveSegmentId(newId);
  };


  return (
    <Box
      sx={{
        position: "absolute",
        top: "80px",
        left: "20px",
        width: "320px",
        backgroundColor: "#2c2c2c",
        color: "#ffffff",
        borderRadius: "8px",
        padding: "16px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
        zIndex: 1000,
        pointerEvents: disabled ? "none" : "auto",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography
          variant="h6"
          sx={{
            color: "#ff6b6b",
            fontWeight: "bold",
            fontSize: "14px",
            letterSpacing: "1px",
          }}
        >
          SEGMENTATION
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Help">
            <IconButton size="small" sx={{ color: "#ffffff" }}>
              <Info fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton size="small" sx={{ color: "#ffffff" }} onClick={onClose}>
            <Close fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Tool Selection */}
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            gap: 1,
            mb: 2,
            backgroundColor: "#1a1a1a",
            borderRadius: "6px",
            padding: "4px",
          }}
        >
          <Button
            size="small"
            variant={activeTool === "boundingBox" ? "contained" : "outlined"}
            onClick={() => setActiveTool("boundingBox")}
            sx={{
              flex: 1,
              fontSize: "12px",
              textTransform: "none",
              backgroundColor: activeTool === "boundingBox" ? "#3f51b5" : "transparent",
              color: "#ffffff",
              border: "1px solid #555",
              "&:hover": {
                backgroundColor: activeTool === "boundingBox" ? "#303f9f" : "#333",
              },
            }}
          >
            📦 Bounding Box
          </Button>
          <Button
            size="small"
            variant={activeTool === "smartPaint" ? "contained" : "outlined"}
            onClick={() => setActiveTool("smartPaint")}
            sx={{
              flex: 1,
              fontSize: "12px",
              textTransform: "none",
              backgroundColor: activeTool === "smartPaint" ? "#3f51b5" : "transparent",
              color: "#ffffff",
              border: "1px solid #555",
              "&:hover": {
                backgroundColor: activeTool === "smartPaint" ? "#303f9f" : "#333",
              },
            }}
          >
            🎨 Smart Paint
          </Button>
        </Box>
      </Box>

      {/* Mode Selection */}
      <Box sx={{ mb: 3 }}>
        <ButtonGroup
          size="small"
          sx={{
            width: "100%",
            "& .MuiButton-root": {
              flex: 1,
              fontSize: "12px",
              textTransform: "none",
              color: "#ffffff",
              border: "1px solid #555",
            },
          }}
        >
          <Button
            variant={activeMode === "2D" ? "contained" : "outlined"}
            onClick={() => setActiveMode("2D")}
            sx={{
              backgroundColor: activeMode === "2D" ? "#ff6b6b" : "transparent",
              "&:hover": {
                backgroundColor: activeMode === "2D" ? "#ff5252" : "#333",
              },
            }}
          >
            2D
          </Button>
          <Button
            variant={activeMode === "3D" ? "contained" : "outlined"}
            onClick={() => setActiveMode("3D")}
            sx={{
              backgroundColor: activeMode === "3D" ? "#ff6b6b" : "transparent",
              "&:hover": {
                backgroundColor: activeMode === "3D" ? "#ff5252" : "#333",
              },
            }}
          >
            3D
          </Button>
        </ButtonGroup>
      </Box>

      {/* Segments List */}
      <Box sx={{ mb: 3 }}>
        {segments.map((segment) => (
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
              border: "1px solid #555",
              cursor: "pointer",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  backgroundColor: segment.color,
                  borderRadius: "2px",
                }}
              />
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSegmentVisibility(segment.id);
                }}
                sx={{ color: "#ffffff" }}
              >
                {segment.visible ? (
                  <Visibility fontSize="small" />
                ) : (
                  <VisibilityOff fontSize="small" />
                )}
              </IconButton>
              <Typography sx={{ fontSize: "12px", color: "#ffffff" }}>
                {segment.name}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <IconButton size="small" sx={{ color: "#ffffff" }}>
                <Edit fontSize="small" />
              </IconButton>
              <Tooltip title="Info">
                <IconButton size="small" sx={{ color: "#ffffff" }}>
                  <Info fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton size="small" sx={{ color: "#ffffff" }}>
                <ContentCopy fontSize="small" />
              </IconButton>
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
            </Box>
          </Box>
        ))}
        <Button
          size="small"
          onClick={addNewSegment}
          sx={{
            width: "100%",
            mt: 1,
            fontSize: "12px",
            textTransform: "none",
            color: "#ffffff",
            border: "1px dashed #555",
            "&:hover": { border: "1px dashed #777" },
          }}
        >
          + Add Segment
        </Button>
      </Box>

      {/* Tool Settings */}
      {activeTool === "smartPaint" && (
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: "12px", mb: 1, color: "#cccccc" }}>
            Radius
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Slider
              value={radius}
              onChange={(e, value) => setRadius(value)}
              min={1}
              max={20}
              step={0.1}
              size="small"
              sx={{
                flex: 1,
                color: "#3f51b5",
                "& .MuiSlider-thumb": {
                  width: 16,
                  height: 16,
                },
              }}
            />
            <Typography sx={{ fontSize: "12px", minWidth: "30px" }}>
              {radius}
            </Typography>
          </Box>

          <Typography sx={{ fontSize: "12px", mb: 1, mt: 2, color: "#cccccc" }}>
            Sensitivity
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Slider
              value={sensitivity}
              onChange={(e, value) => setSensitivity(value)}
              min={1}
              max={10}
              step={1}
              size="small"
              sx={{
                flex: 1,
                color: "#3f51b5",
                "& .MuiSlider-thumb": {
                  width: 16,
                  height: 16,
                },
              }}
            />
            <Typography sx={{ fontSize: "12px", minWidth: "20px" }}>
              {sensitivity}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Action Buttons */}
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          size="small"
          onClick={clearActiveSegment}
          sx={{
            flex: 1,
            fontSize: "12px",
            textTransform: "none",
            color: "#ffffff",
            border: "1px solid #555",
            "&:hover": { backgroundColor: "#333" },
          }}
        >
          Clear
        </Button>
        <Button
          size="small"
          variant="contained"
          sx={{
            flex: 1,
            fontSize: "12px",
            textTransform: "none",
            backgroundColor: "#4caf50",
            "&:hover": { backgroundColor: "#45a049" },
          }}
        >
          Apply
        </Button>
      </Box>
    </Box>
  );
};

export default Segmentation;