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

// MeasurementTool.jsx
const MeasurementTool = ({
  containerWidth = 900,
  containerHeight = 550,
  pixelSpacing = [1, 1], // Default to [1, 1] if not provided
  viewportScale = 2.43, // Adjusted to 2.43 for accurate eye measurement
}) => {
  const canvasRef = useRef(null);
  const fabricCanvas = useRef(null);
  const [distance, setDistance] = useState(null);
  const [tool, setTool] = useState("Line");
  const pointsRef = useRef([]);

  useEffect(() => {
    if (!canvasRef.current) return;

    fabricCanvas.current = new fabric.Canvas(canvasRef.current, {
      selection: false,
      backgroundColor: "transparent",
      enableRetinaScaling: true, // Enable subpixel rendering for precision
    });

    fabricCanvas.current.setWidth(containerWidth);
    fabricCanvas.current.setHeight(containerHeight);

    // Convert canvas pixels to image pixels (account for viewport scale)
    const canvasToImagePixel = (px) => px / viewportScale;

    // Convert image pixels to millimeters using pixel spacing
    // pixelSpacing[0] = mm/pixel_x, pixelSpacing[1] = mm/pixel_y
    const pxToMm = (pxX, pxY) => {
      const imagePxX = canvasToImagePixel(pxX);
      const imagePxY = canvasToImagePixel(pxY);
      const mmX = imagePxX * pixelSpacing[0];
      const mmY = imagePxY * pixelSpacing[1];
      // Use higher precision for distance calculation
      return Math.sqrt(mmX * mmX + mmY * mmY).toFixed(3); // Increased precision
    };

    // Calculate scale-invariant font size for measurements
    const getScaleInvariantFontSize = (baseFontSize = 14) => {
      return Math.max(baseFontSize / viewportScale, 10); // Minimum font size of 10
    };

    // Calculate scale-invariant circle radius for points
    const getScaleInvariantRadius = (baseRadius = 4) => {
      return Math.max(baseRadius / viewportScale, 2); // Minimum radius of 2
    };

    // Calculate scale-invariant stroke width
    const getScaleInvariantStrokeWidth = (baseWidth = 2) => {
      return Math.max(baseWidth / viewportScale, 1); // Minimum stroke width of 1
    };

    const onClick = (opt) => {
      const pointer = fabricCanvas.current.getPointer(opt.e);
      const newPoint = { x: pointer.x, y: pointer.y };
      const circle = new fabric.Circle({
        left: newPoint.x,
        top: newPoint.y,
        radius: getScaleInvariantRadius(),
        fill: "red",
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        baseRadius: 4, // Store base radius for scaling
      });
      fabricCanvas.current.add(circle);
      pointsRef.current.push(newPoint);

      // Line Measurement
      if (tool === "Line" && pointsRef.current.length === 2) {
        const [p1, p2] = pointsRef.current;
        const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
          stroke: "blue",
          strokeWidth: getScaleInvariantStrokeWidth(),
          selectable: false,
          evented: false,
          baseStrokeWidth: 2, // Store base stroke width
        });
        fabricCanvas.current.add(line);

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distMm = pxToMm(dx, dy);
        setDistance(distMm);

        const text = new fabric.Text(`${distMm} mm`, {
          left: (p1.x + p2.x) / 2,
          top: (p1.y + p2.y) / 2 - 10,
          fontSize: getScaleInvariantFontSize(),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.5)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14, // Store base font size
        });
        fabricCanvas.current.add(text);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // Angle Measurement
      if (tool === "Angle" && pointsRef.current.length === 3) {
        const [p1, p2, p3] = pointsRef.current;
        const line1 = new fabric.Line([p2.x, p2.y, p1.x, p1.y], {
          stroke: "green",
          strokeWidth: getScaleInvariantStrokeWidth(),
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
        });
        const line2 = new fabric.Line([p2.x, p2.y, p3.x, p3.y], {
          stroke: "green",
          strokeWidth: getScaleInvariantStrokeWidth(),
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
        });
        fabricCanvas.current.add(line1);
        fabricCanvas.current.add(line2);

        // More precise angle calculation
        const vector1 = { x: p1.x - p2.x, y: p1.y - p2.y };
        const vector2 = { x: p3.x - p2.x, y: p3.y - p2.y };
        const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y;
        const mag1 = Math.sqrt(vector1.x * vector1.x + vector1.y * vector1.y);
        const mag2 = Math.sqrt(vector2.x * vector2.x + vector2.y * vector2.y);
        let angle = Math.acos(dotProduct / (mag1 * mag2)) * (180 / Math.PI);

        if (angle < 0) angle += 360;
        if (angle > 180) angle = 360 - angle;

        const angleDeg = angle.toFixed(3); // Increased precision

        const text = new fabric.Text(`${angleDeg}°`, {
          left: p2.x,
          top: p2.y - 15,
          fontSize: getScaleInvariantFontSize(),
          fill: "orange",
          backgroundColor: "rgba(0,0,0,0.5)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
        });
        fabricCanvas.current.add(text);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // Rectangle Measurement
      if (tool === "Rectangle" && pointsRef.current.length === 4) {
        const polygon = new fabric.Polygon(pointsRef.current, {
          stroke: "yellow",
          strokeWidth: getScaleInvariantStrokeWidth(),
          fill: "rgba(255,255,0,0.2)",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
        });
        fabricCanvas.current.add(polygon);

        const [p1, p2, p3, p4] = pointsRef.current;
        const sides = [
          [p1, p2],
          [p2, p3],
          [p3, p4],
          [p4, p1],
        ];

        // Calculate area for rectangle
        const areaPx = Math.abs(
          (p1.x * p2.y + p2.x * p3.y + p3.x * p4.y + p4.x * p1.y) -
          (p1.y * p2.x + p2.y * p3.x + p3.y * p4.x + p4.y * p1.x)
        ) / 2;
        const areaMm = (areaPx * pixelSpacing[0] * pixelSpacing[1]).toFixed(3);

        sides.forEach(([a, b]) => {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distMm = pxToMm(dx, dy);

          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;

          const text = new fabric.Text(`${distMm} mm`, {
            left: midX,
            top: midY,
            fontSize: getScaleInvariantFontSize(),
            fill: "yellow",
            backgroundColor: "rgba(0,0,0,0.5)",
            originX: "center",
            originY: "center",
            selectable: false,
            evented: false,
            baseFontSize: 14,
          });
          fabricCanvas.current.add(text);
        });

        // Add area label at the center
        const centerX = (p1.x + p2.x + p3.x + p4.x) / 4;
        const centerY = (p1.y + p2.y + p3.y + p4.y) / 4;
        const areaText = new fabric.Text(`${areaMm} mm²`, {
          left: centerX,
          top: centerY,
          fontSize: getScaleInvariantFontSize(),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.5)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
        });
        fabricCanvas.current.add(areaText);

        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // ---------------- ELLIPSE ----------------
      if (tool === "Ellipse" && pointsRef.current.length === 2) {
        const [p1, p2] = pointsRef.current;
        const ellipse = new fabric.Ellipse({
          left: Math.min(p1.x, p2.x),
          top: Math.min(p1.y, p2.y),
          rx: Math.abs(p2.x - p1.x) / 2,
          ry: Math.abs(p2.y - p1.y) / 2,
          fill: "rgba(0,255,0,0.2)",
          stroke: "green",
          strokeWidth: getScaleInvariantStrokeWidth(),
          originX: "left",
          originY: "top",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
        });
        fabricCanvas.current.add(ellipse);

        // Add major and minor axis measurements
        const majorAxis = Math.abs(p2.x - p1.x) * pixelSpacing[0];
        const minorAxis = Math.abs(p2.y - p1.y) * pixelSpacing[1];
        const centerX = (p1.x + p2.x) / 2;
        const centerY = (p1.y + p2.y) / 2;

        const majorText = new fabric.Text(`${majorAxis.toFixed(3)} mm`, {
          left: centerX,
          top: Math.min(p1.y, p2.y) - 10,
          fontSize: getScaleInvariantFontSize(),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.5)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
        });
        const minorText = new fabric.Text(`${minorAxis.toFixed(3)} mm`, {
          left: Math.min(p1.x, p2.x) - 30,
          top: centerY,
          fontSize: getScaleInvariantFontSize(),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.5)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
        });
        fabricCanvas.current.add(majorText, minorText);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // ---------------- ARROW ----------------
      if (tool === "Arrow" && pointsRef.current.length === 2) {
        const [p1, p2] = pointsRef.current;
        const arrow = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
          stroke: "white",
          strokeWidth: getScaleInvariantStrokeWidth(),
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
        });
        const head = new fabric.Triangle({
          left: p2.x,
          top: p2.y,
          angle: Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI),
          width: 10 / viewportScale,
          height: 15 / viewportScale,
          fill: "white",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseWidth: 10,
          baseHeight: 15,
        });
        fabricCanvas.current.add(arrow);
        fabricCanvas.current.add(head);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // ---------------- TEXT ----------------
      if (tool === "Text" && pointsRef.current.length === 1) {
        const [p] = pointsRef.current;
        const text = new fabric.Textbox("Type here", {
          left: p.x,
          top: p.y,
          fontSize: getScaleInvariantFontSize(16),
          fill: "white",
          backgroundColor: "rgba(0,0,0,0.5)",
          editable: true,
          hasControls: true,
          hasBorders: true,
          baseFontSize: 16,
        });
        fabricCanvas.current.add(text);
        fabricCanvas.current.setActiveObject(text);
        text.enterEditing();
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // ---------------- POLYLINE ----------------
      if (tool === "Polyline" && pointsRef.current.length >= 2) {
        const polyline = new fabric.Polyline(pointsRef.current, {
          stroke: "cyan",
          strokeWidth: getScaleInvariantStrokeWidth(),
          fill: "transparent",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
        });
        fabricCanvas.current.add(polyline);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // ---------------- POLYGON ----------------
      if (tool === "Polygon" && pointsRef.current.length >= 3) {
        const polygon = new fabric.Polygon(pointsRef.current, {
          stroke: "magenta",
          strokeWidth: getScaleInvariantStrokeWidth(),
          fill: "rgba(255,0,255,0.2)",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
        });
        fabricCanvas.current.add(polygon);

        // Add area measurement for polygon
        const areaPx = Math.abs(
          pointsRef.current.reduce((sum, p, i) => {
            const nextP = pointsRef.current[(i + 1) % pointsRef.current.length];
            return sum + p.x * nextP.y - p.y * nextP.x;
          }, 0)
        ) / 2;
        const areaMm = (areaPx * pixelSpacing[0] * pixelSpacing[1]).toFixed(3);

        const centerX = pointsRef.current.reduce((sum, p) => sum + p.x, 0) / pointsRef.current.length;
        const centerY = pointsRef.current.reduce((sum, p) => sum + p.y, 0) / pointsRef.current.length;

        const areaText = new fabric.Text(`${areaMm} mm²`, {
          left: centerX,
          top: centerY,
          fontSize: getScaleInvariantFontSize(),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.5)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
        });
        fabricCanvas.current.add(areaText);

        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }
    };

    fabricCanvas.current.on("mouse:down", onClick);

    return () => {
      if (fabricCanvas.current) {
        fabricCanvas.current.off("mouse:down", onClick);
        fabricCanvas.current.dispose();
        fabricCanvas.current = null;
      }
    };
  }, [tool, containerWidth, containerHeight, pixelSpacing, viewportScale]);

  // Update existing measurements when viewport scale changes
  useEffect(() => {
    if (!fabricCanvas.current) return;

    const canvas = fabricCanvas.current;
    const objects = canvas.getObjects();

    objects.forEach((obj) => {
      // Update text objects to maintain consistent size
      if (obj.type === 'text' || obj.type === 'textbox') {
        const baseFontSize = obj.get('baseFontSize') || 14;
        obj.set('fontSize', Math.max(baseFontSize / viewportScale, 10));
      }
      
      // Update circles (measurement points)
      if (obj.type === 'circle') {
        const baseRadius = obj.get('baseRadius') || 4;
        obj.set('radius', Math.max(baseRadius / viewportScale, 2));
      }
      
      // Update stroke widths
      if (obj.strokeWidth) {
        const baseStrokeWidth = obj.get('baseStrokeWidth') || 2;
        obj.set('strokeWidth', Math.max(baseStrokeWidth / viewportScale, 1));
      }
      
      // Update arrow head size
      if (obj.type === 'triangle') {
        const baseWidth = obj.get('baseWidth') || 10;
        const baseHeight = obj.get('baseHeight') || 15;
        obj.set('width', baseWidth / viewportScale);
        obj.set('height', baseHeight / viewportScale);
      }
    });

    canvas.renderAll();
  }, [viewportScale]);

  const clearMeasurements = () => {
    if (fabricCanvas.current) {
      fabricCanvas.current.clear();
      pointsRef.current = [];
      setDistance(null);
    }
  };

  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 10, pointerEvents: "auto" }}>
      <div style={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 20,
        display: "flex",
        gap: "10px",
        alignItems: "center",
        background: "rgba(0,0,0,0.8)",
        padding: "8px",
        borderRadius: "4px"
      }}>
        <select
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          style={{
            padding: "5px",
            fontWeight: "bold",
            backgroundColor: "white",
            border: "1px solid #ccc",
            borderRadius: "4px"
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
            padding: "5px 10px",
            backgroundColor: "#ff4444",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
        >
          Clear
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
          pointerEvents: "auto"
        }}
      />

      {distance && tool === "Line" && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            color: "yellow",
            fontWeight: "bold",
            backgroundColor: "rgba(0,0,0,0.8)",
            padding: "5px 10px",
            borderRadius: "4px",
            zIndex: 20
          }}
        >
          Distance: {distance} mm
        </div>
      )}
    </div>
  );
};

export default MeasurementTool;