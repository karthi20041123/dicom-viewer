import React, { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";

const TOOL_OPTIONS = [
  "Line",
  "Angle",
  "Ellipse",
  "Rectangle",
  "Arrow",
  "Text",
  "Polyline",
  "Polygon",
];

const MeasurementTool = ({
  containerWidth = 900,
  containerHeight = 550,
  pixelSpacings = {},
  viewports = {},
  imageMetadata = {},
  layout = "2x2",
}) => {
  const canvasRef = useRef(null);
  const fabricCanvas = useRef(null);
  const containerRef = useRef(null);
  const [tool, setTool] = useState("Line");
  const pointsRef = useRef([]);
  const tempShapeRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const actualWidth = rect.width;
    const actualHeight = rect.height;

    fabricCanvas.current = new fabric.Canvas(canvasRef.current, {
      selection: false,
      backgroundColor: "transparent",
      enableRetinaScaling: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
    });

    fabricCanvas.current.setWidth(actualWidth);
    fabricCanvas.current.setHeight(actualHeight);

    const [rows, cols] = layout.split("x").map(Number);
    const protocolPanelWidth = 210;

    const getViewerInfo = (canvasX, canvasY) => {
      const adjustedX = canvasX - protocolPanelWidth;
      const viewerWidth = (actualWidth - protocolPanelWidth) / cols;
      const viewerHeight = actualHeight / rows;

      if (adjustedX < 0 || canvasY < 0 || canvasY >= actualHeight) return null;

      const col = Math.floor(adjustedX / viewerWidth);
      const row = Math.floor(canvasY / viewerHeight);
      const index = row * cols + col;

      if (index >= rows * cols || col >= cols || row >= rows) return null;

      const localX = adjustedX - col * viewerWidth;
      const localY = canvasY - row * viewerHeight;

      return {
        index,
        localX,
        localY,
        viewerWidth,
        viewerHeight,
        viewerLeft: protocolPanelWidth + col * viewerWidth,
        viewerTop: row * viewerHeight,
      };
    };

    // High-precision canvas → image coordinate transform
    const canvasToImageCoords = (canvasX, canvasY) => {
      const info = getViewerInfo(canvasX, canvasY);
      if (!info) return { x: 0, y: 0 };

      const { index, localX, localY, viewerWidth, viewerHeight } = info;
      const vp = viewports[index] || {};
      const scale = vp.scale || 1;
      const ic = imageMetadata[index]?.imageColumns || 512;
      const ir = imageMetadata[index]?.imageRows || 512;

      const centerX = viewerWidth / 2;
      const centerY = viewerHeight / 2;

      let relX = localX - centerX;
      let relY = localY - centerY;

      // Apply flips
      if (vp.hflip) relX = -relX;
      if (vp.vflip) relY = -relY;

      // Apply rotation
      const angleRad = ((vp.rotation || 0) * Math.PI) / 180;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      const rotatedX = relX * cosA - relY * sinA;
      const rotatedY = relX * sinA + relY * cosA;

      // Apply translation (normalized by scale)
      const transX = (vp.translation?.x || 0) / scale;
      const transY = (vp.translation?.y || 0) / scale;

      // Final image coordinates
      const imageX = rotatedX / scale + ic / 2 + transX;
      const imageY = rotatedY / scale + ir / 2 + transY;

      return { x: imageX, y: imageY };
    };

    // High-precision distance in mm
    const calculateDistanceMm = (p1, p2) => {
      const i1 = getViewerInfo(p1.x, p1.y);
      const i2 = getViewerInfo(p2.x, p2.y);
      if (!i1 || !i2 || i1.index !== i2.index) return 0;

      const img1 = canvasToImageCoords(p1.x, p1.y);
      const img2 = canvasToImageCoords(p2.x, p2.y);
      const ps = pixelSpacings[i1.index] || [1, 1];

      const deltaCol = (img2.x - img1.x) * ps[1];
      const deltaRow = (img2.y - img1.y) * ps[0];

      return Math.sqrt(deltaCol * deltaCol + deltaRow * deltaRow);
    };

    // Scale-invariant sizing
    const getScaleInvariantFontSize = (base = 14, idx = 0) => {
      const scale = viewports[idx]?.scale || 1;
      return Math.max(Math.round(base / scale), 8);
    };
    const getScaleInvariantRadius = (base = 4, idx = 0) => {
      const scale = viewports[idx]?.scale || 1;
      return Math.max(Math.round(base / scale), 1.5);
    };
    const getScaleInvariantStrokeWidth = (base = 2, idx = 0) => {
      const scale = viewports[idx]?.scale || 1;
      return Math.max(Math.round(base / scale), 1);
    };

    const updateTempShape = () => {
      if (tempShapeRef.current) {
        fabricCanvas.current.remove(tempShapeRef.current);
        tempShapeRef.current = null;
      }

      const points = pointsRef.current;
      if (points.length < 2) return;

      const idx = getViewerInfo(points[0].x, points[0].y).index;

      // Ensure all points are in the same viewer
      if (!points.every((p) => getViewerInfo(p.x, p.y)?.index === idx)) return;

      const isPolygon = tool === "Polygon";
      const ShapeClass = isPolygon ? fabric.Polygon : fabric.Polyline;

      const options = {
        stroke: isPolygon ? "magenta" : "cyan",
        strokeWidth: getScaleInvariantStrokeWidth(2.5, idx),
        fill: isPolygon ? "rgba(255,0,255,0.15)" : "transparent",
        strokeLineCap: "round",
        strokeLineJoin: "round",
        selectable: false,
        evented: false,
        baseStrokeWidth: 2.5,
        associatedIndex: idx,
      };

      tempShapeRef.current = new ShapeClass(points, options);
      fabricCanvas.current.add(tempShapeRef.current);
      fabricCanvas.current.renderAll();
    };

    const finalizeMultiPointShape = () => {
      if (tempShapeRef.current) {
        fabricCanvas.current.remove(tempShapeRef.current);
        tempShapeRef.current = null;
      }

      const points = pointsRef.current;
      const idx = getViewerInfo(points[0].x, points[0].y).index;

      const isPolygon = tool === "Polygon";
      const ShapeClass = isPolygon ? fabric.Polygon : fabric.Polyline;

      const options = {
        stroke: isPolygon ? "magenta" : "cyan",
        strokeWidth: getScaleInvariantStrokeWidth(2.5, idx),
        fill: isPolygon ? "rgba(255,0,255,0.15)" : "transparent",
        strokeLineCap: "round",
        strokeLineJoin: "round",
        selectable: false,
        evented: false,
        baseStrokeWidth: 2.5,
        associatedIndex: idx,
      };

      const finalShape = new ShapeClass(points, options);
      fabricCanvas.current.add(finalShape);

      if (tool === "Polyline") {
        let totalDist = 0;
        for (let i = 1; i < points.length; i++) {
          const segDist = calculateDistanceMm(points[i - 1], points[i]);
          totalDist += segDist;

          const mid = {
            x: (points[i - 1].x + points[i].x) / 2,
            y: (points[i - 1].y + points[i].y) / 2,
          };
          const segLabel = new fabric.Text(`${segDist.toFixed(2)} mm`, {
            left: mid.x,
            top: mid.y - 10,
            fontSize: getScaleInvariantFontSize(12, idx),
            fill: "cyan",
            backgroundColor: "rgba(0,0,0,0.6)",
            padding: 2,
            originX: "center",
            originY: "center",
            selectable: false,
            evented: false,
            baseFontSize: 12,
            associatedIndex: idx,
          });
          fabricCanvas.current.add(segLabel);
        }

        // Add total distance label
        const lastP = points[points.length - 1];
        const totalLabel = new fabric.Text(`Total: ${totalDist.toFixed(2)} mm`, {
          left: lastP.x + 10,
          top: lastP.y + 10,
          fontSize: getScaleInvariantFontSize(14, idx),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.7)",
          padding: 4,
          selectable: false,
          evented: false,
          baseFontSize: 14,
          associatedIndex: idx,
        });
        fabricCanvas.current.add(totalLabel);
      } else if (tool === "Polygon") {
        // Calculate area using shoelace formula in image space
        const imgPoints = points.map((p) => canvasToImageCoords(p.x, p.y));
        let area = 0;
        for (let i = 0; i < imgPoints.length; i++) {
          const j = (i + 1) % imgPoints.length;
          area += imgPoints[i].x * imgPoints[j].y - imgPoints[j].x * imgPoints[i].y;
        }
        area = Math.abs(area / 2);

        const ps = pixelSpacings[idx] || [1, 1];
        const areaMm = area * ps[0] * ps[1];

        // Calculate centroid for label placement
        let cx = 0,
          cy = 0;
        points.forEach((p) => {
          cx += p.x;
          cy += p.y;
        });
        cx /= points.length;
        cy /= points.length;

        const areaLabel = new fabric.Text(`${areaMm.toFixed(2)} mm²`, {
          left: cx,
          top: cy,
          fontSize: getScaleInvariantFontSize(14, idx),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.7)",
          padding: 4,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
          associatedIndex: idx,
        });
        fabricCanvas.current.add(areaLabel);
      }

      pointsRef.current = [];
      fabricCanvas.current.renderAll();
    };

    const onMouseDown = (opt) => {
      const pointer = fabricCanvas.current.getPointer(opt.e, true);
      const newPoint = { x: pointer.x, y: pointer.y };
      const info = getViewerInfo(newPoint.x, newPoint.y);
      if (!info) return;

      const index = info.index;

      if (opt.e.button === 2) {
        // Right-click to finalize multi-point tools
        if (["Polyline", "Polygon"].includes(tool)) {
          finalizeMultiPointShape();
        }
        return;
      }

      // Left-click: add point marker
      const circle = new fabric.Circle({
        left: newPoint.x,
        top: newPoint.y,
        radius: getScaleInvariantRadius(5, index),
        fill: "red",
        stroke: "white",
        strokeWidth: 1,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        baseRadius: 5,
        associatedIndex: index,
      });
      fabricCanvas.current.add(circle);
      pointsRef.current.push(newPoint);

      // Handle tools
      if (tool === "Line" && pointsRef.current.length === 2) {
        const [p1, p2] = pointsRef.current;
        const lineIdx = getViewerInfo(p1.x, p1.y).index;

        const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
          stroke: "cyan",
          strokeWidth: getScaleInvariantStrokeWidth(2.5, lineIdx),
          strokeLineCap: "round",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2.5,
          associatedIndex: lineIdx,
        });
        fabricCanvas.current.add(line);

        const distMm = calculateDistanceMm(p1, p2);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        const label = new fabric.Text(`${distMm.toFixed(2)} mm`, {
          left: midX,
          top: midY - 12,
          fontSize: getScaleInvariantFontSize(15, lineIdx),
          fill: "yellow",
          fontWeight: "bold",
          backgroundColor: "rgba(0,0,0,0.7)",
          padding: 4,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 15,
          associatedIndex: lineIdx,
        });
        fabricCanvas.current.add(label);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      } else if (tool === "Angle" && pointsRef.current.length === 3) {
        const [p1, p2, p3] = pointsRef.current;
        const idx = getViewerInfo(p2.x, p2.y).index;

        const line1 = new fabric.Line([p2.x, p2.y, p1.x, p1.y], {
          stroke: "lime",
          strokeWidth: getScaleInvariantStrokeWidth(2.5, idx),
          strokeLineCap: "round",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2.5,
          associatedIndex: idx,
        });
        const line2 = new fabric.Line([p2.x, p2.y, p3.x, p3.y], {
          stroke: "lime",
          strokeWidth: getScaleInvariantStrokeWidth(2.5, idx),
          strokeLineCap: "round",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2.5,
          associatedIndex: idx,
        });
        fabricCanvas.current.add(line1, line2);

        const ps = pixelSpacings[idx] || [1, 1];
        const v1 = {
          x: (canvasToImageCoords(p1.x, p1.y).x - canvasToImageCoords(p2.x, p2.y).x) * ps[1],
          y: (canvasToImageCoords(p1.x, p1.y).y - canvasToImageCoords(p2.x, p2.y).y) * ps[0],
        };
        const v2 = {
          x: (canvasToImageCoords(p3.x, p3.y).x - canvasToImageCoords(p2.x, p2.y).x) * ps[1],
          y: (canvasToImageCoords(p3.x, p3.y).y - canvasToImageCoords(p2.x, p2.y).y) * ps[0],
        };

        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.hypot(v1.x, v1.y);
        const mag2 = Math.hypot(v2.x, v2.y);
        const cosTheta = Math.max(Math.min(dot / (mag1 * mag2), 1), -1);
        const angle = Math.acos(cosTheta) * (180 / Math.PI);

        const text = new fabric.Text(`${angle.toFixed(1)}°`, {
          left: p2.x,
          top: p2.y - 20,
          fontSize: getScaleInvariantFontSize(16, idx),
          fill: "orange",
          fontWeight: "bold",
          backgroundColor: "rgba(0,0,0,0.7)",
          padding: 4,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 16,
          associatedIndex: idx,
        });
        fabricCanvas.current.add(text);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      } else if (tool === "Ellipse" && pointsRef.current.length === 2) {
        const [p1, p2] = pointsRef.current;
        const idx = getViewerInfo(p1.x, p1.y).index;

        const left = Math.min(p1.x, p2.x);
        const top = Math.min(p1.y, p2.y);
        const rx = Math.abs(p2.x - p1.x) / 2;
        const ry = Math.abs(p2.y - p1.y) / 2;

        const ellipse = new fabric.Ellipse({
          left,
          top,
          rx,
          ry,
          fill: "rgba(0,255,0,0.15)",
          stroke: "lime",
          strokeWidth: getScaleInvariantStrokeWidth(2.5, idx),
          strokeLineCap: "round",
          originX: "left",
          originY: "top",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2.5,
          associatedIndex: idx,
        });
        fabricCanvas.current.add(ellipse);

        const img1 = canvasToImageCoords(p1.x, p1.y);
        const img2 = canvasToImageCoords(p2.x, p2.y);
        const ps = pixelSpacings[idx] || [1, 1];

        const widthMm = Math.abs(img2.x - img1.x) * ps[1];
        const heightMm = Math.abs(img2.y - img1.y) * ps[0];

        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;

        const major = new fabric.Text(`${widthMm.toFixed(2)} mm`, {
          left: cx,
          top: top - 18,
          fontSize: getScaleInvariantFontSize(14, idx),
          fill: "yellow",
          fontWeight: "bold",
          backgroundColor: "rgba(0,0,0,0.7)",
          padding: 3,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
          associatedIndex: idx,
        });
        const minor = new fabric.Text(`${heightMm.toFixed(2)} mm`, {
          left: left - 35,
          top: cy,
          fontSize: getScaleInvariantFontSize(14, idx),
          fill: "yellow",
          fontWeight: "bold",
          backgroundColor: "rgba(0,0,0,0.7)",
          padding: 3,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
          associatedIndex: idx,
        });
        fabricCanvas.current.add(major, minor);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      } else if (tool === "Rectangle" && pointsRef.current.length === 2) {
        const [p1, p2] = pointsRef.current;
        const idx = getViewerInfo(p1.x, p1.y).index;

        const rect = new fabric.Rect({
          left: Math.min(p1.x, p2.x),
          top: Math.min(p1.y, p2.y),
          width: Math.abs(p2.x - p1.x),
          height: Math.abs(p2.y - p1.y),
          fill: "rgba(255,255,0,0.1)",
          stroke: "yellow",
          strokeWidth: getScaleInvariantStrokeWidth(2.5, idx),
          selectable: false,
          evented: false,
          baseStrokeWidth: 2.5,
          associatedIndex: idx,
        });
        fabricCanvas.current.add(rect);

        const img1 = canvasToImageCoords(p1.x, p1.y);
        const img2 = canvasToImageCoords(p2.x, p2.y);
        const ps = pixelSpacings[idx] || [1, 1];
        const wMm = Math.abs(img2.x - img1.x) * ps[1];
        const hMm = Math.abs(img2.y - img1.y) * ps[0];

        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;

        const label = new fabric.Text(`${wMm.toFixed(2)} × ${hMm.toFixed(2)} mm`, {
          left: cx,
          top: cy,
          fontSize: getScaleInvariantFontSize(14, idx),
          fill: "white",
          backgroundColor: "rgba(0,0,0,0.7)",
          padding: 4,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
          associatedIndex: idx,
        });
        fabricCanvas.current.add(label);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      } else if (tool === "Arrow" && pointsRef.current.length === 2) {
        const [p1, p2] = pointsRef.current;
        const idx = getViewerInfo(p1.x, p1.y).index;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
        const scale = viewports[idx]?.scale || 1;

        const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
          stroke: "white",
          strokeWidth: getScaleInvariantStrokeWidth(3, idx),
          selectable: false,
          evented: false,
          baseStrokeWidth: 3,
          associatedIndex: idx,
        });
        const head = new fabric.Triangle({
          left: p2.x,
          top: p2.y,
          angle,
          width: 18 / scale,
          height: 24 / scale,
          fill: "white",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseWidth: 18,
          baseHeight: 24,
          associatedIndex: idx,
        });
        fabricCanvas.current.add(line, head);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      } else if (tool === "Text" && pointsRef.current.length === 1) {
        const [p] = pointsRef.current;
        const idx = getViewerInfo(p.x, p.y).index;
        const textbox = new fabric.Textbox("Type here", {
          left: p.x,
          top: p.y,
          fontSize: getScaleInvariantFontSize(18, idx),
          fill: "white",
          backgroundColor: "rgba(0,0,0,0.7)",
          padding: 6,
          editable: true,
          hasControls: false,
          borderColor: "cyan",
          baseFontSize: 18,
          associatedIndex: idx,
        });
        fabricCanvas.current.add(textbox);
        fabricCanvas.current.setActiveObject(textbox);
        textbox.enterEditing();
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      } else if (tool === "Polyline" && pointsRef.current.length >= 2) {
        updateTempShape();
      } else if (tool === "Polygon" && pointsRef.current.length >= 3) {
        updateTempShape();
      }
    };

    fabricCanvas.current.on("mouse:down", onMouseDown);

    return () => {
      if (fabricCanvas.current) {
        fabricCanvas.current.off("mouse:down", onMouseDown);
        fabricCanvas.current.dispose();
        fabricCanvas.current = null;
      }
    };
  }, [tool, pixelSpacings, viewports, imageMetadata, layout]);

  // Update scale-dependent visuals
  useEffect(() => {
    if (!fabricCanvas.current) return;
    const canvas = fabricCanvas.current;
    const objs = canvas.getObjects();

    objs.forEach((obj) => {
      const idx = obj.associatedIndex ?? 0;
      const scale = viewports[idx]?.scale || 1;

      if (obj.type === "text" || obj.type === "textbox") {
        const base = obj.baseFontSize ?? 14;
        obj.set("fontSize", Math.max(Math.round(base / scale), 8));
      }
      if (obj.type === "circle") {
        const base = obj.baseRadius ?? 4;
        obj.set("radius", Math.max(base / scale, 1.5));
      }
      if (obj.strokeWidth !== undefined) {
        const base = obj.baseStrokeWidth ?? 2;
        obj.set("strokeWidth", Math.max(Math.round(base / scale), 1));
      }
      if (obj.type === "triangle") {
        const w = obj.baseWidth ?? 10;
        const h = obj.baseHeight ?? 15;
        obj.set({ width: w / scale, height: h / scale });
      }
    });

    canvas.renderAll();
  }, [viewports]);

  const clearMeasurements = () => {
    if (fabricCanvas.current) {
      fabricCanvas.current.clear();
      pointsRef.current = [];
      tempShapeRef.current = null;
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 10,
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 296,
          left: 10,
          zIndex: 20,
          display: "flex",
          gap: "10px",
          alignItems: "center",
          background: "rgba(0,0,0,0.9)",
          padding: "10px 15px",
          borderRadius: "6px",
          border: "2px solid #020079",
        }}
      >
        <select
          value={tool}
          onChange={(e) => {
            setTool(e.target.value);
            pointsRef.current = [];
            if (fabricCanvas.current) {
              fabricCanvas.current.discardActiveObject();
              fabricCanvas.current.renderAll();
            }
            if (tempShapeRef.current) {
              fabricCanvas.current.remove(tempShapeRef.current);
              tempShapeRef.current = null;
            }
          }}
          style={{
            padding: "8px 12px",
            fontWeight: "bold",
            backgroundColor: "white",
            border: "2px solid #020079",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "11px",
          }}
        >
          {TOOL_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          onClick={clearMeasurements}
          style={{
            padding: "8px 16px",
            backgroundColor: "#ff4444",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "11px",
          }}
        >
          Clear All
        </button>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "auto",
          cursor: tool === "Text" ? "text" : "crosshair",
        }}
      />
    </div>
  );
};

export default MeasurementTool;