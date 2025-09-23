import React, { useEffect, useRef, useState } from "react";
import * as cornerstone from "cornerstone-core";

const Magnifier = ({ viewerRef, viewerRefs, isActive, layout = "1x1" }) => {
  const magnifierRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const [activeViewerIndex, setActiveViewerIndex] = useState(0);

  const magnifierSize = 200; // diameter of magnifier circle
  const zoomFactor = 2; // magnification level
  const verticalOffset = 20; // pixels above cursor
  const horizontalOffset = 10; // pixels to the side of cursor

  // Calculate number of viewers based on layout
  const getViewerCount = (layoutId) => {
    const [rows, cols] = layoutId.split("x").map(Number);
    return rows * cols;
  };

  // Get the correct viewer element based on index
  const getViewerElement = (index) => {
    if (index === 0) {
      return viewerRef?.current;
    }
    return viewerRefs?.current?.[index]?.current;
  };

  // Determine which viewer the mouse is over
  const getActiveViewer = (globalX, globalY) => {
    const viewerCount = getViewerCount(layout);
    const [rows, cols] = layout.split("x").map(Number);

    for (let i = 0; i < viewerCount; i++) {
      const element = getViewerElement(i);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      if (
        globalX >= rect.left &&
        globalX <= rect.right &&
        globalY >= rect.top &&
        globalY <= rect.bottom
      ) {
        return { index: i, element, rect };
      }
    }
    return null;
  };

  // Calculate optimal magnifier position to avoid going off-screen
  const calculateOptimalPosition = (mouseX, mouseY, containerRect) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let x = mouseX;
    let y = mouseY - verticalOffset - magnifierSize;

    // Check if magnifier would go off the right edge
    if (x + magnifierSize > viewportWidth) {
      x = mouseX - magnifierSize - horizontalOffset;
    }

    // Check if magnifier would go off the left edge
    if (x < 0) {
      x = horizontalOffset;
    }

    // Check if magnifier would go off the top edge
    if (y < 0) {
      y = mouseY + verticalOffset;
    }

    // Check if magnifier would go off the bottom edge
    if (y + magnifierSize > viewportHeight) {
      y = viewportHeight - magnifierSize - horizontalOffset;
    }

    return { x, y };
  };

  useEffect(() => {
    const viewerCount = getViewerCount(layout);
    const magnifierCanvas = magnifierRef.current;
    if (!magnifierCanvas) return;

    const ctx = magnifierCanvas.getContext("2d");
    const eventHandlers = [];

    const handleMouseMove = (e) => {
      if (!isActive) {
        setVisible(false);
        return;
      }

      const globalX = e.clientX;
      const globalY = e.clientY;

      const activeViewer = getActiveViewer(globalX, globalY);
      if (!activeViewer) {
        setVisible(false);
        return;
      }

      const { index, element, rect } = activeViewer;
      const x = globalX - rect.left;
      const y = globalY - rect.top;

      setActiveViewerIndex(index);
      
      // Calculate optimal position for magnifier
      const optimalPos = calculateOptimalPosition(globalX, globalY, rect);
      setPosition(optimalPos);
      setVisible(true);

      try {
        const cornerstoneCanvas = element.querySelector("canvas");
        if (!cornerstoneCanvas) return;

        const image = cornerstone.getImage(element);
        if (!image) return;

        const viewport = cornerstone.getViewport(element);
        if (!viewport) return;

        const scale = viewport.scale * zoomFactor;

        // Clear the magnifier canvas
        ctx.clearRect(0, 0, magnifierSize, magnifierSize);

        // Save context state
        ctx.save();

        // Create circular clipping path
        ctx.beginPath();
        ctx.arc(magnifierSize / 2, magnifierSize / 2, magnifierSize / 2, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.clip();

        // Calculate source rectangle for magnification
        const sourceSize = magnifierSize / scale;
        const sx = Math.max(0, x - sourceSize / 2);
        const sy = Math.max(0, y - sourceSize / 2);
        
        // Ensure we don't go beyond canvas boundaries
        const canvasWidth = cornerstoneCanvas.width;
        const canvasHeight = cornerstoneCanvas.height;
        const actualSWidth = Math.min(sourceSize, canvasWidth - sx);
        const actualSHeight = Math.min(sourceSize, canvasHeight - sy);

        // Draw the magnified portion
        if (actualSWidth > 0 && actualSHeight > 0) {
          const destX = (magnifierSize - actualSWidth * scale) / 2;
          const destY = (magnifierSize - actualSHeight * scale) / 2;
          
          ctx.drawImage(
            cornerstoneCanvas,
            sx, sy, actualSWidth, actualSHeight,
            destX, destY, actualSWidth * scale, actualSHeight * scale
          );
        }

        // Restore context state
        ctx.restore();

        // Draw magnifier border
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(magnifierSize / 2, magnifierSize / 2, magnifierSize / 2 - 1.5, 0, 2 * Math.PI);
        ctx.stroke();

        // Reset shadow
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Draw crosshair in center
        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        
        const center = magnifierSize / 2;
        const crosshairSize = 10;
        
        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(center - crosshairSize, center);
        ctx.lineTo(center + crosshairSize, center);
        ctx.stroke();
        
        // Vertical line
        ctx.beginPath();
        ctx.moveTo(center, center - crosshairSize);
        ctx.lineTo(center, center + crosshairSize);
        ctx.stroke();
        
        ctx.setLineDash([]);

      } catch (error) {
        console.warn("Error rendering magnifier:", error);
      }
    };

    const handleMouseLeave = () => {
      setVisible(false);
    };

    const handleMouseEnter = () => {
      if (isActive) {
        setVisible(true);
      }
    };

    // Add event listeners to all viewer elements
    for (let i = 0; i < viewerCount; i++) {
      const element = getViewerElement(i);
      if (element) {
        element.addEventListener("mousemove", handleMouseMove);
        element.addEventListener("mouseleave", handleMouseLeave);
        element.addEventListener("mouseenter", handleMouseEnter);
        
        eventHandlers.push({
          element,
          events: [
            { type: "mousemove", handler: handleMouseMove },
            { type: "mouseleave", handler: handleMouseLeave },
            { type: "mouseenter", handler: handleMouseEnter }
          ]
        });
      }
    }

    // Cleanup function
    return () => {
      eventHandlers.forEach(({ element, events }) => {
        events.forEach(({ type, handler }) => {
          element.removeEventListener(type, handler);
        });
      });
    };
  }, [viewerRef, viewerRefs, isActive, layout]);

  // Handle window resize to reposition magnifier if needed
  useEffect(() => {
    const handleResize = () => {
      if (visible) {
        setVisible(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [visible]);

  return (
    <canvas
      ref={magnifierRef}
      width={magnifierSize}
      height={magnifierSize}
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        pointerEvents: "none",
        borderRadius: "50%",
        display: visible ? "block" : "none",
        zIndex: 1000,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
        border: "2px solid #ffffff",
      }}
    />
  );
};

export default Magnifier;