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

// MeasurementTool.jsx - Accurate DICOM Measurements
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
  const [distance, setDistance] = useState(null);
  const [tool, setTool] = useState("Line");
  const pointsRef = useRef([]);

  useEffect(() => {
    if (!canvasRef.current) return;

    fabricCanvas.current = new fabric.Canvas(canvasRef.current, {
      selection: false,
      backgroundColor: "transparent",
      enableRetinaScaling: true,
    });

    fabricCanvas.current.setWidth(containerWidth);
    fabricCanvas.current.setHeight(containerHeight);

    const [rows, cols] = layout.split("x").map(Number);

    const getViewerInfo = (canvasX, canvasY) => {
      const colWidth = containerWidth / cols;
      const rowHeight = containerHeight / rows;
      const col = Math.floor(canvasX / colWidth);
      const row = Math.floor(canvasY / rowHeight);
      const index = row * cols + col;
      if (index >= rows * cols) return null;
      const localX = canvasX - col * colWidth;
      const localY = canvasY - row * rowHeight;
      return { index, localX, localY, colWidth, rowHeight };
    };

    // Accurate coordinate transformation from canvas to image space, matching Cornerstone's canvasToPixel
    const canvasToImageCoords = (canvasX, canvasY) => {
      const info = getViewerInfo(canvasX, canvasY);
      if (!info) return { x: 0, y: 0 };
      const { index, localX, localY, colWidth, rowHeight } = info;
      const vp = viewports[index] || null;
      if (!vp) return { x: localX, y: localY };
      const centerX = colWidth / 2;
      const centerY = rowHeight / 2;
      let relativeX = localX - centerX;
      let relativeY = localY - centerY;

      // Apply flips
      if (vp.hflip) {
        relativeX = -relativeX;
      }
      if (vp.vflip) {
        relativeY = -relativeY;
      }

      // Apply rotation
      const angleRadians = vp.rotation * (Math.PI / 180);
      const cosA = Math.cos(angleRadians);
      const sinA = Math.sin(angleRadians);

      const newRelativeX = relativeX * cosA - relativeY * sinA;
      const newRelativeY = relativeX * sinA + relativeY * cosA;

      // Apply scale and translation, adjusted for image dimensions
      const ic = imageMetadata[index]?.imageColumns || 512;
      const ir = imageMetadata[index]?.imageRows || 512;
      const scale = vp.scale || 1;
      const imageX = (newRelativeX / scale) + (ic / 2) + (vp.translation?.x / scale || 0);
      const imageY = (newRelativeY / scale) + (ir / 2) + (vp.translation?.y / scale || 0);

      return { x: imageX, y: imageY };
    };

    // Accurate distance calculation in mm using proper pixel spacing
    const calculateDistanceMm = (point1, point2) => {
      const info1 = getViewerInfo(point1.x, point1.y);
      const info2 = getViewerInfo(point2.x, point2.y);
      if (!info1 || !info2) return 0;
      const img1 = canvasToImageCoords(point1.x, point1.y);
      const img2 = canvasToImageCoords(point2.x, point2.y);
      if (info1.index !== info2.index) {
        console.warn("Cross-viewer measurement may not be accurate");
      }
      const ps = pixelSpacings[info1.index] || [1, 1];
      const deltaX = img2.x - img1.x;
      const deltaY = img2.y - img1.y;
      const mmX = deltaX * ps[1];
      const mmY = deltaY * ps[0];
      return Math.sqrt(mmX * mmX + mmY * mmY);
    };

    // Calculate area in mm² using proper pixel spacing
    const calculateAreaMm2 = (points) => {
      if (points.length === 0) return 0;
      const info1 = getViewerInfo(points[0].x, points[0].y);
      if (!info1) return 0;
      const imagePoints = points.map((p) => canvasToImageCoords(p.x, p.y));
      let area = 0;
      for (let i = 0; i < imagePoints.length; i++) {
        const j = (i + 1) % imagePoints.length;
        area += imagePoints[i].x * imagePoints[j].y;
        area -= imagePoints[j].x * imagePoints[i].y;
      }
      area = Math.abs(area) / 2;
      const ps = pixelSpacings[info1.index] || [1, 1];
      const pixelAreaMm2 = ps[0] * ps[1];
      return area * pixelAreaMm2;
    };

    // Scale-invariant styling functions
    const getScaleInvariantFontSize = (baseFontSize = 14, index = 0) => {
      const scale = viewports[index]?.scale || 1;
      return Math.max(baseFontSize / Math.max(scale, 0.5), 10);
    };

    const getScaleInvariantRadius = (baseRadius = 4, index = 0) => {
      const scale = viewports[index]?.scale || 1;
      return Math.max(baseRadius / Math.max(scale, 0.5), 2);
    };

    const getScaleInvariantStrokeWidth = (baseWidth = 2, index = 0) => {
      const scale = viewports[index]?.scale || 1;
      return Math.max(baseWidth / Math.max(scale, 0.5), 1);
    };

    const onClick = (opt) => {
      const pointer = fabricCanvas.current.getPointer(opt.e);
      const newPoint = { x: pointer.x, y: pointer.y };
      const info = getViewerInfo(newPoint.x, newPoint.y);
      if (!info) return;
      const index = info.index;

      const circle = new fabric.Circle({
        left: newPoint.x,
        top: newPoint.y,
        radius: getScaleInvariantRadius(4, index),
        fill: "red",
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        baseRadius: 4,
        associatedIndex: index,
      });
      fabricCanvas.current.add(circle);
      pointsRef.current.push(newPoint);

      // Line Measurement
      if (tool === "Line" && pointsRef.current.length === 2) {
        const [p1, p2] = pointsRef.current;
        const index = getViewerInfo(p1.x, p1.y).index;
        const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
          stroke: "blue",
          strokeWidth: getScaleInvariantStrokeWidth(2, index),
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
          associatedIndex: index,
        });
        fabricCanvas.current.add(line);

        const distMm = calculateDistanceMm(p1, p2);
        setDistance(distMm);

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2 - 10;
        const textInfo = getViewerInfo(midX, midY);
        const textIndex = textInfo ? textInfo.index : index;

        const text = new fabric.Text(`${distMm.toFixed(2)} mm`, {
          left: midX,
          top: midY,
          fontSize: getScaleInvariantFontSize(14, textIndex),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.7)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
          associatedIndex: textIndex,
        });
        fabricCanvas.current.add(text);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // Angle Measurement
      if (tool === "Angle" && pointsRef.current.length === 3) {
        const [p1, p2, p3] = pointsRef.current;
        
        // Convert to image coordinates for accurate angle calculation
        const img1 = canvasToImageCoords(p1.x, p1.y);
        const img2 = canvasToImageCoords(p2.x, p2.y);
        const img3 = canvasToImageCoords(p3.x, p3.y);

        const index = getViewerInfo(p1.x, p1.y).index;

        const line1 = new fabric.Line([p2.x, p2.y, p1.x, p1.y], {
          stroke: "green",
          strokeWidth: getScaleInvariantStrokeWidth(2, index),
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
          associatedIndex: index,
        });
        const line2 = new fabric.Line([p2.x, p2.y, p3.x, p3.y], {
          stroke: "green",
          strokeWidth: getScaleInvariantStrokeWidth(2, index),
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
          associatedIndex: index,
        });
        fabricCanvas.current.add(line1);
        fabricCanvas.current.add(line2);

        // Calculate angle using image coordinates (accounts for pixel spacing)
        const ps = pixelSpacings[index] || [1, 1];
        const vector1 = { 
          x: (img1.x - img2.x) * ps[1], 
          y: (img1.y - img2.y) * ps[0] 
        };
        const vector2 = { 
          x: (img3.x - img2.x) * ps[1], 
          y: (img3.y - img2.y) * ps[0] 
        };
        
        const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y;
        const mag1 = Math.sqrt(vector1.x * vector1.x + vector1.y * vector1.y);
        const mag2 = Math.sqrt(vector2.x * vector2.x + vector2.y * vector2.y);
        
        let angle = Math.acos(Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2)))) * (180 / Math.PI);
        
        // Ensure angle is between 0 and 180 degrees
        if (angle > 180) angle = 360 - angle;

        const textX = p2.x;
        const textY = p2.y - 15;
        const textInfo = getViewerInfo(textX, textY);
        const textIndex = textInfo ? textInfo.index : index;

        const text = new fabric.Text(`${angle.toFixed(1)}°`, {
          left: textX,
          top: textY,
          fontSize: getScaleInvariantFontSize(14, textIndex),
          fill: "orange",
          backgroundColor: "rgba(0,0,0,0.7)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
          associatedIndex: textIndex,
        });
        fabricCanvas.current.add(text);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // Rectangle Measurement
      if (tool === "Rectangle" && pointsRef.current.length === 4) {
        const [p1, p2, p3, p4] = pointsRef.current;
        const index = getViewerInfo(p1.x, p1.y).index;
        const polygon = new fabric.Polygon(pointsRef.current, {
          stroke: "yellow",
          strokeWidth: getScaleInvariantStrokeWidth(2, index),
          fill: "rgba(255,255,0,0.2)",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
          associatedIndex: index,
        });
        fabricCanvas.current.add(polygon);

        const sides = [
          [p1, p2],
          [p2, p3],
          [p3, p4],
          [p4, p1],
        ];

        sides.forEach(([a, b]) => {
          const distMm = calculateDistanceMm(a, b);
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const textInfo = getViewerInfo(midX, midY);
          const textIndex = textInfo ? textInfo.index : index;
          const text = new fabric.Text(`${distMm.toFixed(2)} mm`, {
            left: midX,
            top: midY,
            fontSize: getScaleInvariantFontSize(14, textIndex),
            fill: "yellow",
            backgroundColor: "rgba(0,0,0,0.7)",
            originX: "center",
            originY: "center",
            selectable: false,
            evented: false,
            baseFontSize: 14,
            associatedIndex: textIndex,
          });
          fabricCanvas.current.add(text);
        });

        // Calculate and display area
        const areaMm2 = calculateAreaMm2(pointsRef.current);
        const centerX = (p1.x + p2.x + p3.x + p4.x) / 4;
        const centerY = (p1.y + p2.y + p3.y + p4.y) / 4;
        const areaInfo = getViewerInfo(centerX, centerY);
        const areaIndex = areaInfo ? areaInfo.index : index;
        const areaText = new fabric.Text(`${areaMm2.toFixed(2)} mm²`, {
          left: centerX,
          top: centerY,
          fontSize: getScaleInvariantFontSize(14, areaIndex),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.7)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
          associatedIndex: areaIndex,
        });
        fabricCanvas.current.add(areaText);

        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // Ellipse Measurement
      if (tool === "Ellipse" && pointsRef.current.length === 2) {
        const [p1, p2] = pointsRef.current;
        const index = getViewerInfo(p1.x, p1.y).index;
        const ellipse = new fabric.Ellipse({
          left: Math.min(p1.x, p2.x),
          top: Math.min(p1.y, p2.y),
          rx: Math.abs(p2.x - p1.x) / 2,
          ry: Math.abs(p2.y - p1.y) / 2,
          fill: "rgba(0,255,0,0.2)",
          stroke: "green",
          strokeWidth: getScaleInvariantStrokeWidth(2, index),
          originX: "left",
          originY: "top",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
          associatedIndex: index,
        });
        fabricCanvas.current.add(ellipse);

        // Calculate accurate axis measurements
        const img1 = canvasToImageCoords(p1.x, p1.y);
        const img2 = canvasToImageCoords(p2.x, p2.y);
        const ps = pixelSpacings[index] || [1, 1];
        const majorAxisMm = Math.abs(img2.x - img1.x) * ps[1];
        const minorAxisMm = Math.abs(img2.y - img1.y) * ps[0];
        
        const centerX = (p1.x + p2.x) / 2;
        const centerY = (p1.y + p2.y) / 2;

        const majorTextX = centerX;
        const majorTextY = Math.min(p1.y, p2.y) - 10;
        const majorInfo = getViewerInfo(majorTextX, majorTextY);
        const majorIndex = majorInfo ? majorInfo.index : index;

        const majorText = new fabric.Text(`${majorAxisMm.toFixed(2)} mm`, {
          left: majorTextX,
          top: majorTextY,
          fontSize: getScaleInvariantFontSize(14, majorIndex),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.7)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
          associatedIndex: majorIndex,
        });
        
        const minorTextX = Math.min(p1.x, p2.x) - 30;
        const minorTextY = centerY;
        const minorInfo = getViewerInfo(minorTextX, minorTextY);
        const minorIndex = minorInfo ? minorInfo.index : index;

        const minorText = new fabric.Text(`${minorAxisMm.toFixed(2)} mm`, {
          left: minorTextX,
          top: minorTextY,
          fontSize: getScaleInvariantFontSize(14, minorIndex),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.7)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
          associatedIndex: minorIndex,
        });
        
        fabricCanvas.current.add(majorText, minorText);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // Arrow Tool
      if (tool === "Arrow" && pointsRef.current.length === 2) {
        const [p1, p2] = pointsRef.current;
        const index = getViewerInfo(p1.x, p1.y).index;
        const arrow = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
          stroke: "white",
          strokeWidth: getScaleInvariantStrokeWidth(2, index),
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
          associatedIndex: index,
        });
        
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
        const head = new fabric.Triangle({
          left: p2.x,
          top: p2.y,
          angle: angle,
          width: 10 / Math.max(viewports[index]?.scale || 1, 0.5),
          height: 15 / Math.max(viewports[index]?.scale || 1, 0.5),
          fill: "white",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseWidth: 10,
          baseHeight: 15,
          associatedIndex: index,
        });
        
        fabricCanvas.current.add(arrow);
        fabricCanvas.current.add(head);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // Text Tool
      if (tool === "Text" && pointsRef.current.length === 1) {
        const [p] = pointsRef.current;
        const index = getViewerInfo(p.x, p.y).index;
        const text = new fabric.Textbox("Type here", {
          left: p.x,
          top: p.y,
          fontSize: getScaleInvariantFontSize(16, index),
          fill: "white",
          backgroundColor: "rgba(0,0,0,0.7)",
          editable: true,
          hasControls: true,
          hasBorders: true,
          baseFontSize: 16,
          associatedIndex: index,
        });
        fabricCanvas.current.add(text);
        fabricCanvas.current.setActiveObject(text);
        text.enterEditing();
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // Polyline Tool
      if (tool === "Polyline" && pointsRef.current.length >= 2) {
        const [p1] = pointsRef.current;
        const index = getViewerInfo(p1.x, p1.y).index;
        const polyline = new fabric.Polyline(pointsRef.current, {
          stroke: "cyan",
          strokeWidth: getScaleInvariantStrokeWidth(2, index),
          fill: "transparent",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
          associatedIndex: index,
        });
        fabricCanvas.current.add(polyline);
        fabricCanvas.current.renderAll();
        pointsRef.current = [];
      }

      // Polygon Tool
      if (tool === "Polygon" && pointsRef.current.length >= 3) {
        const [p1] = pointsRef.current;
        const index = getViewerInfo(p1.x, p1.y).index;
        const polygon = new fabric.Polygon(pointsRef.current, {
          stroke: "magenta",
          strokeWidth: getScaleInvariantStrokeWidth(2, index),
          fill: "rgba(255,0,255,0.2)",
          selectable: false,
          evented: false,
          baseStrokeWidth: 2,
          associatedIndex: index,
        });
        fabricCanvas.current.add(polygon);

        // Calculate and display area
        const areaMm2 = calculateAreaMm2(pointsRef.current);
        const centerX = pointsRef.current.reduce((sum, p) => sum + p.x, 0) / pointsRef.current.length;
        const centerY = pointsRef.current.reduce((sum, p) => sum + p.y, 0) / pointsRef.current.length;
        const areaInfo = getViewerInfo(centerX, centerY);
        const areaIndex = areaInfo ? areaInfo.index : index;
        const areaText = new fabric.Text(`${areaMm2.toFixed(2)} mm²`, {
          left: centerX,
          top: centerY,
          fontSize: getScaleInvariantFontSize(14, areaIndex),
          fill: "yellow",
          backgroundColor: "rgba(0,0,0,0.7)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          baseFontSize: 14,
          associatedIndex: areaIndex,
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
  }, [tool, containerWidth, containerHeight, pixelSpacings, viewports, imageMetadata, layout]);

  // Update existing measurements when viewport changes
  useEffect(() => {
    if (!fabricCanvas.current) return;

    const canvas = fabricCanvas.current;
    const objects = canvas.getObjects();

    objects.forEach((obj) => {
      const index = obj.get("associatedIndex") || 0;
      if (obj.type === "text" || obj.type === "textbox") {
        const baseFontSize = obj.get("baseFontSize") || 14;
        obj.set("fontSize", getScaleInvariantFontSize(baseFontSize, index));
      }

      if (obj.type === "circle") {
        const baseRadius = obj.get("baseRadius") || 4;
        obj.set("radius", getScaleInvariantRadius(baseRadius, index));
      }

      if (obj.strokeWidth) {
        const baseStrokeWidth = obj.get("baseStrokeWidth") || 2;
        obj.set("strokeWidth", getScaleInvariantStrokeWidth(baseStrokeWidth, index));
      }

      if (obj.type === "triangle") {
        const baseWidth = obj.get("baseWidth") || 10;
        const baseHeight = obj.get("baseHeight") || 15;
        obj.set("width", baseWidth / Math.max(viewports[index]?.scale || 1, 0.5));
        obj.set("height", baseHeight / Math.max(viewports[index]?.scale || 1, 0.5));
      }
    });

    canvas.renderAll();
  }, [viewports]);

  const clearMeasurements = () => {
    if (fabricCanvas.current) {
      fabricCanvas.current.clear();
      pointsRef.current = [];
      setDistance(null);
    }
  };

  return (
    <div
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
          top: 10,
          left: 10,
          zIndex: 20,
          display: "flex",
          gap: "10px",
          alignItems: "center",
          background: "rgba(0,0,0,0.8)",
          padding: "8px",
          borderRadius: "4px",
        }}
      >
        <select
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          style={{
            padding: "5px",
            fontWeight: "bold",
            backgroundColor: "white",
            border: "1px solid #ccc",
            borderRadius: "4px",
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
            fontWeight: "bold",
          }}
        >
          Clear
        </button>
        {/* <div style={{ color: "white", fontSize: "12px", marginLeft: "10px" }}>
          Pixel Spacing: {(pixelSpacings[0]?.[0] || 1).toFixed(3)} × {(pixelSpacings[0]?.[1] || 1).toFixed(3)} mm
        </div> */}
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
            zIndex: 20,
          }}
        >
          Distance: {distance.toFixed(2)} mm
        </div>
      )}
    </div>
  );
};

export default MeasurementTool;