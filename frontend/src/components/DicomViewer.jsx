import React, { useState, useEffect, useRef } from "react";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneTools from "cornerstone-tools";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import * as dicomParser from "dicom-parser";
import Hammer from "hammerjs";
import Toolbar from "./Toolbar";
import Segmentation from "./tools/Segmentation";
import MultiplanarReconstruction from "./tools/MultiplanarReconstruction";
import Button from "@mui/material/Button";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import MeasurementTool from "./tools/Measurement";

// Configure external dependencies
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.Hammer = Hammer;

// Initialize Cornerstone tools and web workers
const initializeTools = () => {
  try {
    cornerstoneWADOImageLoader.webWorkerManager.initialize({
      maxWebWorkers: navigator.hardwareConcurrency || 1,
      startWebWorkersOnDemand: true,
      webWorkerPath:
        "https://unpkg.com/cornerstone-wado-image-loader@4.13.2/dist/legacy/cornerstoneWADOImageLoaderWebWorker.min.js",
      taskConfiguration: {
        decodeTask: {
          initializeCodecsOnStartup: false,
          codecsPath:
            "https://unpkg.com/cornerstone-wado-image-loader@4.13.2/dist/legacy/codecs.js",
          usePDFJS: false,
          strict: false,
        },
      },
    });

    cornerstoneTools.init({
      showSVGCursors: true,
      globalToolSyncEnabled: true,
    });

    const addIf = (Tool, config) => {
      if (!Tool || cornerstoneTools.getToolForElement(null, config?.name)) return;
      cornerstoneTools.addTool(Tool, config);
    };
    addIf(cornerstoneTools.PanTool, { name: "Pan" });
    addIf(cornerstoneTools.ZoomTool, { name: "Zoom" });
    addIf(cornerstoneTools.ZoomTouchPinchTool);
    addIf(cornerstoneTools.RotateTool, { name: "Rotate" });
    addIf(cornerstoneTools.WwwcTool, { name: "Wwwc" });
    addIf(cornerstoneTools.LengthTool, { name: "Measure" });
    addIf(cornerstoneTools.MagnifyTool, { name: "Magnify" });
  } catch (err) {
    console.error("Failed to init tools:", err);
  }
};
initializeTools();

function DicomViewer({ files }) {
  const viewerRef = useRef(null);
  const viewerRefs = useRef([]); // Array of refs for multiple viewers
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTool, setActiveTool] = useState("Pan");
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [brightness, setBrightness] = useState(40);
  const [contrast, setContrast] = useState(400);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSegmentation, setShowSegmentation] = useState(false);
  const [showMPR, setShowMPR] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [layout, setLayout] = useState("2x2"); // Match the 2x2 layout from the image
  const [measurement, setMeasurement] = useState(null);
  const [pixelSpacing, setPixelSpacing] = useState([1, 1]); // Default pixel spacing
  const [viewportScale, setViewportScale] = useState(1); // Default viewport scale

  // Reset currentIndex when files change
  useEffect(() => {
    setCurrentIndex(0);
  }, [files]);

  // Keyboard shortcuts for MPR
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.shiftKey && isImageLoaded && !isPlaying) {
        switch (event.key.toLowerCase()) {
          case "m":
            event.preventDefault();
            setShowMPR(true);
            break;
          case "q":
            event.preventDefault();
            setShowMPR(true);
            // Set MPR mode to oblique (handled in MultiplanarReconstruction)
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isImageLoaded, isPlaying]);

  // Calculate number of viewers based on layout
  const getViewerCount = (layoutId) => {
    const [rows, cols] = layoutId.split("x").map(Number);
    return rows * cols;
  };

  // Initialize viewer refs based on layout
  useEffect(() => {
    const viewerCount = getViewerCount(layout);
    viewerRefs.current = Array(viewerCount)
      .fill(null)
      .map((_, i) => viewerRefs.current[i] || React.createRef());
  }, [layout]);

  // Enable Cornerstone viewers only when elements are available
  useEffect(() => {
    const viewerCount = getViewerCount(layout);

    const enableElement = (element, index) => {
      if (!element) return;

      let isEnabled = true;
      try {
        cornerstone.getEnabledElement(element);
      } catch {
        isEnabled = false;
      }

      if (!isEnabled) {
        try {
          cornerstone.enable(element);
          cornerstoneTools.addStackStateManager(element, ["stack"]);
          if (index === 0) {
            cornerstoneTools.setToolActive("Pan", { mouseButtonMask: 1 });
          }
        } catch (err) {
          console.error(`Failed to enable element ${index}:`, err);
        }
      }
    };

    for (let i = 0; i < viewerCount; i++) {
      const element = i === 0 ? viewerRef.current : viewerRefs.current[i]?.current;
      enableElement(element, i);
    }

    return () => {
      for (let i = 0; i < viewerCount; i++) {
        const element = i === 0 ? viewerRef.current : viewerRefs.current[i]?.current;
        if (element) {
          let isEnabled = false;
          try {
            if (cornerstone.getEnabledElement(element)) isEnabled = true;
          } catch {}
          if (isEnabled) {
            cornerstone.disable(element);
          }
        }
      }
    };
  }, [layout]);

  // Handle mouse wheel for image navigation
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const wheelHandler = (e) => {
      e.preventDefault();
      if (e.deltaY > 0 && currentIndex < files.length - 1 && !isPlaying) {
        setCurrentIndex((prev) => prev + 1);
      } else if (e.deltaY < 0 && currentIndex > 0 && !isPlaying) {
        setCurrentIndex((prev) => prev - 1);
      }
    };

    element.addEventListener("wheel", wheelHandler, { passive: false });
    return () => element.removeEventListener("wheel", wheelHandler);
  }, [currentIndex, files.length, isPlaying]);

  // Load DICOM images and extract pixel spacing
  useEffect(() => {
    if (!files || !files.length) {
      console.warn("No files provided to DicomViewer");
      setIsImageLoaded(false);
      setPixelSpacing([1, 1]);
      setViewportScale(1);
      return;
    }

    let objectUrls = [];
    const imageIds = files.map((file) => {
      if (typeof file === "string") {
        return file.startsWith("wadouri:") ? file : `wadouri:${file}`;
      } else if (file instanceof Blob || file instanceof File) {
        const url = URL.createObjectURL(file);
        objectUrls.push(url);
        return `wadouri:${url}`;
      } else {
        console.error("Invalid file type:", file);
        return null;
      }
    }).filter(Boolean);

    if (imageIds.length === 0) {
      setIsImageLoaded(false);
      return;
    }

    const viewerCount = getViewerCount(layout);

    for (let i = 0; i < viewerCount; i++) {
      const element = i === 0 ? viewerRef.current : viewerRefs.current[i]?.current;
      if (!element) {
        console.warn(`Viewer element ${i} is not available`);
        continue;
      }

      let isEnabled = false;
      try {
        if (cornerstone.getEnabledElement(element)) isEnabled = true;
      } catch {}
      if (!isEnabled) continue;

      const fileIndex = Math.min(currentIndex + i, imageIds.length - 1);
      const imageId = imageIds[fileIndex];

      if (!imageId) {
        console.error(`Image ID is undefined for viewer ${i} at fileIndex ${fileIndex}`);
        continue;
      }

      const stack = {
        currentImageIdIndex: fileIndex,
        imageIds,
      };

      try {
        cornerstoneTools.clearToolState(element, "stack");
        cornerstoneTools.addToolState(element, "stack", stack);
      } catch (err) {
        console.error(`Failed to set stack data for viewer ${i}:`, err);
        continue;
      }

      cornerstone
        .loadImage(imageId)
        .then((image) => {
          cornerstone.displayImage(element, image);
          const viewport = cornerstone.getViewport(element) || {};
          cornerstone.setViewport(element, {
            ...viewport,
            voi: { windowCenter: brightness, windowWidth: contrast },
          });

          // Extract pixel spacing from DICOM metadata
          const pixelSpacingData = image.data?.floatStringArray?.("x00280030") || [1, 1];
          if (i === 0) {
            setPixelSpacing(pixelSpacingData);
            setViewportScale(viewport.scale || 1);
            setIsImageLoaded(true);

            switch (activeTool) {
              case "Pan":
                cornerstoneTools.setToolActive("Pan", { mouseButtonMask: 1 });
                break;
              case "Zoom":
                cornerstoneTools.setToolActive("Zoom", { mouseButtonMask: 1 });
                break;
              case "Rotate":
                cornerstoneTools.setToolActive("Rotate", { mouseButtonMask: 1 });
                break;
              case "Wwwc":
                cornerstoneTools.setToolActive("Wwwc", { mouseButtonMask: 1 });
                break;
              case "Measure":
                cornerstoneTools.setToolActive("Measure", { mouseButtonMask: 1 });
                break;
              case "Magnify":
                cornerstoneTools.setToolActive("Magnify", { mouseButtonMask: 1 });
                break;
              default:
                cornerstoneTools.setToolActive("Pan", { mouseButtonMask: 1 });
                break;
            }
          }

          cornerstone.updateImage(element);
        })
        .catch((err) => {
          console.error(`Image load failed for viewer ${i} at imageId ${imageId}:`, err);
          if (i === 0) setIsImageLoaded(false);
        });
    }

    return () => {
      objectUrls.forEach(URL.revokeObjectURL);
    };
  }, [files, currentIndex, activeTool, brightness, contrast, layout]);

  // Listen for viewport changes to update scale
  useEffect(() => {
    const element = viewerRef.current;
    if (!element || !isImageLoaded) return;

    const handleViewportChange = () => {
      try {
        const viewport = cornerstone.getViewport(element);
        if (viewport && viewport.scale !== viewportScale) {
          setViewportScale(viewport.scale);
        }
      } catch (err) {
        console.error("Error getting viewport:", err);
      }
    };

    element.addEventListener(cornerstone.EVENTS.IMAGE_RENDERED, handleViewportChange);
    element.addEventListener(cornerstone.EVENTS.NEW_IMAGE, handleViewportChange);

    return () => {
      if (element) {
        element.removeEventListener(cornerstone.EVENTS.IMAGE_RENDERED, handleViewportChange);
        element.removeEventListener(cornerstone.EVENTS.NEW_IMAGE, handleViewportChange);
      }
    };
  }, [isImageLoaded, viewportScale]);

  // Update measurements from Cornerstone's LengthTool (Fixed)
  useEffect(() => {
    if (!isImageLoaded || !isMeasuring || !viewerRef.current) return;

    const element = viewerRef.current;

    const updateMeasurement = () => {
      try {
        const toolData = cornerstoneTools.getToolState(element, "Measure");

        if (toolData && toolData.data && toolData.data.length > 0) {
          const measurementData = toolData.data[toolData.data.length - 1]; // Use the last measurement
          const start = measurementData.handles.start; // Fixed: .handles.start
          const end = measurementData.handles.end;     // Fixed: .handles.end
          
          // No need for / currentScale; coordinates are in image space
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          
          // Fixed: Swap multipliers (pixelSpacing[0] = row/y, [1] = column/x)
          const mmX = dx * pixelSpacing[1];
          const mmY = dy * pixelSpacing[0];
          const distance = Math.sqrt(mmX * mmX + mmY * mmY);
          
          setMeasurement(distance > 0 ? distance : 0);
        } else {
          setMeasurement(null);
        }
      } catch (err) {
        console.error("Error updating measurement:", err);
        setMeasurement(null);
      }
    };

    // Call once on mount
    updateMeasurement();

    // Listen for measurement changes (real-time updates)
    const handleMeasurementChange = (event) => {
      if (event.detail && event.detail.toolName === "Measure") {
        updateMeasurement();
      }
    };

    // Relevant events from Cornerstone Tools
    element.addEventListener("cornerstonetoolsmeasurementadded", handleMeasurementChange);
    element.addEventListener("cornerstonetoolsmeasurementmodified", handleMeasurementChange);
    element.addEventListener("cornerstonetoolsmeasurementcompleted", handleMeasurementChange);

    return () => {
      element.removeEventListener("cornerstonetoolsmeasurementadded", handleMeasurementChange);
      element.removeEventListener("cornerstonetoolsmeasurementmodified", handleMeasurementChange);
      element.removeEventListener("cornerstonetoolsmeasurementcompleted", handleMeasurementChange);
    };
  }, [isImageLoaded, isMeasuring, activeTool, pixelSpacing, viewportScale]);

  // Update viewport for brightness and contrast only for enabled elements
  useEffect(() => {
    if (!isImageLoaded) return;

    const viewerCount = getViewerCount(layout);

    for (let i = 0; i < viewerCount; i++) {
      const element = i === 0 ? viewerRef.current : viewerRefs.current[i]?.current;
      if (!element) continue;

      let isEnabled = false;
      try {
        if (cornerstone.getEnabledElement(element)) isEnabled = true;
      } catch {}
      if (!isEnabled) continue;

      try {
        const viewport = cornerstone.getViewport(element) || {};
        viewport.voi.windowCenter = brightness;
        viewport.voi.windowWidth = contrast;
        cornerstone.setViewport(element, viewport);
        if (i === 0) {
          setViewportScale(viewport.scale || 1); // Update viewport scale
        }
        cornerstone.updateImage(element);
      } catch (err) {
        console.error(`Failed to update viewport for viewer ${i}:`, err);
      }
    }
  }, [brightness, contrast, isImageLoaded, layout]);

  // Enhanced renderViewers function with protocol panel
  const renderViewers = () => {
    const [rows, cols] = layout.split("x").map(Number);
    const viewers = [];
    const viewerCount = rows * cols;

    const getViewerStyle = (index) => ({
      position: "relative",
      zIndex: 1,
      backgroundColor: "black",
      border: "2px solid #020079",
      width: `${100 / cols}%`,
      height: `${100 / rows}%`,
      display: "inline-block",
      boxSizing: "border-box",
    });

    // Mock protocol panel (left side) - ignoring "Anonymized" data
    const protocolPanel = (
      <div
        style={{
          width: "200px",
          backgroundColor: "#2a2a2a",
          color: "#fff",
          padding: "10px",
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          overflowY: "auto",
        }}
      >
        <h3 style={{ margin: "0 0 10px" }}>Protocol Panel</h3>
        {files.map((file, index) => (
          <div key={index} style={{ marginBottom: "5px" }}>
            MR {index + 1} - {file.name || `Image ${index + 1}`}
          </div>
        ))}
      </div>
    );

    for (let i = 0; i < viewerCount; i++) {
      const isMainViewer = i === 0;
      viewers.push(
        <div
          key={`viewer-${i}`}
          ref={isMainViewer ? viewerRef : (el) => {
            if (viewerRefs.current[i]) viewerRefs.current[i].current = el;
          }}
          style={getViewerStyle(i)}
        >
          {isImageLoaded && (
            <div
              style={{
                position: "absolute",
                top: 5,
                left: 5,
                color: "white",
                fontSize: "12px",
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                padding: "2px 5px",
                borderRadius: "3px",
              }}
            >
              {files[currentIndex + i]?.name || `Image ${i + 1}`}
            </div>
          )}
          {/* Add orientation labels like in the image */}
          {isImageLoaded && (
            <div
              style={{
                position: "absolute",
                bottom: 5,
                right: 5,
                color: "white",
                fontSize: "12px",
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                padding: "2px 5px",
                borderRadius: "3px",
              }}
            >
              {i === 0 && "AR"}
              {i === 1 && "AX PL"}
              {i === 2 && "AX"}
              {i === 3 && "PIL"}
            </div>
          )}
        </div>
      );
    }

    return (
      <>
        {protocolPanel}
        <div style={{ marginLeft: "210px", width: "calc(100% - 210px)", display: "flex", flexWrap: "wrap" }}>
          {viewers}
        </div>
      </>
    );
  };

  // Calculate container dimensions for MeasurementTool
  const containerWidth = 900; // Match maxWidth of the viewer container
  const containerHeight =
    getViewerCount(layout) > 4 ? 800 : getViewerCount(layout) > 2 ? 600 : 550;

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 1100, // Adjusted to accommodate protocol panel
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minHeight: "100vh",
        position: "relative",
        backgroundColor: "#ffffff",
      }}
    >
      {/* <div style={{ textAlign: "center", marginBottom: 20, zIndex: 10 }}>
        <Button
          variant="contained"
          sx={{
            backgroundColor: "#020079",
            color: "#ffffff",
            "&:hover": { backgroundColor: "#003366" },
            borderRadius: "8px",
          }}
          onClick={() => setShowMPR(!showMPR)}
          disabled={!isImageLoaded || isPlaying}
        >
          {showMPR ? "Hide MPR" : "Show MPR"}
        </Button>
      </div> */}

      <div style={{ zIndex: 20, width: "100%" }}>
        <Toolbar
          activeTool={activeTool}
          handleToolChange={setActiveTool}
          viewerRef={viewerRef}
          files={files}
          isElementEnabled={!!viewerRef.current}
          isImageLoaded={isImageLoaded}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          currentLayout={layout}
          onLayoutChange={setLayout}
          showMPR={showMPR}
          setShowMPR={setShowMPR}
          onViewportChange={setViewportScale}
        />
      </div>

      {isImageLoaded && (
        <div
          className="brightness-contrast-container"
          style={{
            zIndex: 5,
            backgroundColor: "#ffffff",
            padding: "10px",
            borderRadius: "8px",
            boxShadow: "0 2px 4px rgba(0, 31, 63, 0.2)",
            marginBottom: "20px",
            width: "100%",
            maxWidth: "400px",
          }}
        >
          <Typography sx={{ color: "#020079", fontWeight: "bold" }}>Brightness</Typography>
          <Slider
            value={brightness}
            min={1}
            max={200}
            step={1}
            onChange={(e, val) => setBrightness(val)}
            disabled={isPlaying}
            sx={{
              color: "#020079",
              "& .MuiSlider-rail": { backgroundColor: "#f5f7fa" },
              "& .MuiSlider-track": { backgroundColor: "#003366" },
              "& .MuiSlider-thumb": { backgroundColor: "#020079" },
            }}
          />
          <Typography sx={{ color: "#020079", fontWeight: "bold" }}>Contrast</Typography>
          <Slider
            value={contrast}
            min={1}
            max={2000}
            step={1}
            onChange={(e, val) => setContrast(val)}
            disabled={isPlaying}
            sx={{
              color: "#020079",
              "& .MuiSlider-rail": { backgroundColor: "#f5f7fa" },
              "& .MuiSlider-track": { backgroundColor: "#003366" },
              "& .MuiSlider-thumb": { backgroundColor: "#020079" },
            }}
          />
        </div>
      )}

      <div
        style={{
          width: "100%",
          height: containerHeight,
          margin: "20px auto",
          border: "2px solid #020079",
          backgroundColor: "black",
          position: "relative",
          pointerEvents: (isPlaying || !isImageLoaded) ? "none" : "auto",
          display: "flex",
          flexWrap: "wrap",
          zIndex: 1,
        }}
      >
        {renderViewers()}
        {showSegmentation && isImageLoaded && (
          <Segmentation
            viewerRef={viewerRef}
            onClose={() => setShowSegmentation(false)}
            imageIndex={currentIndex}
            files={files}
          />
        )}
        {isMeasuring && isImageLoaded && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              zIndex: 10,
              width: "100%",
              height: "100%",
              pointerEvents: "none",  // Fixed: Allow events to pass through to viewer
            }}
          >
            <MeasurementTool
              measurement={measurement}
              containerWidth={containerWidth}
              containerHeight={containerHeight}
              pixelSpacing={pixelSpacing}
              viewportScale={viewportScale}
            />
          </div>
        )}
      </div>

      {showMPR && (
        <MultiplanarReconstruction
          viewerRef={viewerRef}
          files={files}
          isElementEnabled={!!viewerRef.current}
          isImageLoaded={isImageLoaded}
          onClose={() => setShowMPR(false)}
          disabled={isPlaying}
          currentIndex={currentIndex}
          brightness={brightness}
          contrast={contrast}
        />
      )}

      <Button
        variant="contained"
        sx={{
          backgroundColor: isMeasuring ? "#b00020" : "#020079",
          color: "#ffffff",
          "&:hover": { backgroundColor: isMeasuring ? "#8e0019" : "#003366" },
          borderRadius: "8px",
          marginTop: "16px",
        }}
        onClick={() => {
          setIsMeasuring((prev) => {
            const newIsMeasuring = !prev;
            if (newIsMeasuring) {
              setActiveTool("Measure"); // Activate the tool when turning ON
            } else {
              setActiveTool("Pan"); // Revert to default tool when OFF
              setMeasurement(null); // Clear measurement
              // Optional: Clear drawn lines
              if (viewerRef.current) {
                cornerstoneTools.clearToolState(viewerRef.current, "Measure");
                cornerstone.updateImage(viewerRef.current);
              }
            }
            return newIsMeasuring;
          });
        }}
        disabled={isPlaying}
      >
        📏 Measurement Tool: {isMeasuring ? "ON" : "OFF"}
      </Button>

      {files.length > 1 && (
        <div
          style={{
            backgroundColor: "#ffffff",
            padding: 5,
            padding: 5,
            width: 512,
            marginTop: 10,
            pointerEvents: isPlaying ? "none" : "auto",
            borderRadius: "8px",
            boxShadow: "0 2px 4px rgba(0, 31, 63, 0.2)",
          }}
        >
          <Slider
            value={currentIndex}
            min={0}
            max={files.length - 1}
            step={1}
            onChange={(e, val) => setCurrentIndex(val)}
            disabled={isPlaying}
            sx={{
              color: "#020079",
              "& .MuiSlider-rail": { backgroundColor: "#f5f7fa" },
              "& .MuiSlider-track": { backgroundColor: "#003366" },
              "& .MuiSlider-thumb": { backgroundColor: "#020079" },
            }}
          />
        </div>
      )}

      {isMeasuring && measurement !== null && (
        <Typography
          style={{
            color: "#020079",
            textAlign: "center",
            marginTop: 10,
            backgroundColor: "#ffffff",
            padding: "4px 8px",
            borderRadius: "4px",
            boxShadow: "0 2px 4px rgba(0, 31, 63, 0.2)",
          }}
        >
          Measurement: {measurement.toFixed(2)} mm
        </Typography>
      )}

      {isImageLoaded && (
        <Typography
          variant="caption"
          style={{
            position: "fixed",
            bottom: 40,
            right: 10,
            backgroundColor: "#ffffff",
            color: "#020079",
            padding: "4px 8px",
            borderRadius: 4,
            fontSize: "0.7em",
            boxShadow: "0 2px 4px rgba(0, 31, 63, 0.2)",
            zIndex: 15,
          }}
        >
          Scale: {(viewportScale * 100).toFixed(1)}%
        </Typography>
      )}

      {/* {isImageLoaded && (
        <Typography
          variant="caption"
          style={{
            position: "fixed",
            bottom: 10,
            right: 10,
            backgroundColor: "#ffffff",
            color: "#020079",
            padding: "4px 8px",
            borderRadius: 4,
            fontSize: "0.7em",
            boxShadow: "0 2px 4px rgba(0, 31, 63, 0.2)",
            zIndex: 15,
          }}
        >
          MPR Shortcuts: Shift+M (Orthogonal), Shift+Q (Oblique)
        </Typography>
      )} */}
    </div>
  );
}

export default DicomViewer;