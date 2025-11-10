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
import Typography from "@mui/material/Typography";
import MeasurementTool from "./tools/Measurement";
import { useNavigate } from "react-router-dom";
import { ArrowBack } from "@mui/icons-material";
import "./styles/DicomViewer.css";

// Import Analytics Tracker
import { AnalyticsTracker } from "./AnalyticsDashboard";

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
  const viewerRefs = useRef([]);
  const [activeTool, setActiveTool] = useState("Pan");
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSegmentation, setShowSegmentation] = useState(false);
  const [showMPR, setShowMPR] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [layout, setLayout] = useState("2x2");
  const [measurements, setMeasurements] = useState({});
  const [pixelSpacing, setPixelSpacing] = useState([1, 1]);
  const [viewportScale, setViewportScale] = useState({});
  const [viewport, setViewport] = useState({});
  const [imageMetadata, setImageMetadata] = useState({});
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [droppedViewerIndex, setDroppedViewerIndex] = useState(null);

  // Persistent segments state - stored per image
  const [segmentsByImage, setSegmentsByImage] = useState({});

  const navigate = useNavigate();

  // Load segments from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('dicom_segments_all');
      if (stored) {
        setSegmentsByImage(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load segments from localStorage:", error);
    }
  }, []);

  // Save segments to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(segmentsByImage).length > 0) {
      try {
        localStorage.setItem('dicom_segments_all', JSON.stringify(segmentsByImage));
      } catch (error) {
        console.error("Failed to save segments to localStorage:", error);
      }
    }
  }, [segmentsByImage]);

  // Handler to update segments for current image
  const handleSegmentsChange = (newSegments) => {
    setSegmentsByImage(prev => ({
      ...prev,
      [0]: newSegments // Only one primary viewer now
    }));
  };

  // Get segments for current image
  const getCurrentSegments = () => {
    return segmentsByImage[0] || [];
  };

  // Keyboard shortcuts for MPR & Segmentation
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.shiftKey && isImageLoaded && !isPlaying) {
        switch (event.key.toLowerCase()) {
          case "m":
          case "q":
            event.preventDefault();
            setShowMPR(true);
            break;
          case "s":
            event.preventDefault();
            setShowSegmentation(true);
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

  // Enable Cornerstone viewers
  useEffect(() => {
    const viewerCount = getViewerCount(layout);

    const enableElement = (element, index) => {
      if (!element) {
        console.warn(`Element ${index} is not available for enabling`);
        return;
      }

      let isEnabled = false;
      try {
        cornerstone.getEnabledElement(element);
        isEnabled = true;
      } catch (e) {
        isEnabled = false;
      }

      if (!isEnabled) {
        try {
          console.log(`Enabling element ${index}`);
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

  // Handle mouse wheel for image navigation (now cycles through files in all viewers)
  useEffect(() => {
    const element = viewerRef.current;
    if (!element || !files?.length) return;

    const wheelHandler = (e) => {
      e.preventDefault();
      if (isPlaying) return;

      const delta = e.deltaY > 0 ? 1 : -1;
      const totalImages = files.length;
      const viewerCount = getViewerCount(layout);

      // Cycle through images in all viewers
      for (let i = 0; i < viewerCount; i++) {
        const viewerElement = i === 0 ? viewerRef.current : viewerRefs.current[i]?.current;
        if (!viewerElement) continue;

        try {
          const stackState = cornerstoneTools.getToolState(viewerElement, "stack");
          if (!stackState?.data?.[0]) continue;

          let currentIdx = stackState.data[0].currentImageIdIndex || 0;
          currentIdx = (currentIdx + delta + totalImages) % totalImages;

          cornerstoneTools.scrollToIndex(viewerElement, currentIdx);
        } catch (err) {
          console.warn("Failed to scroll via wheel:", err);
        }
      }
    };

    element.addEventListener("wheel", wheelHandler, { passive: false });
    return () => element.removeEventListener("wheel", wheelHandler);
  }, [files, layout, isPlaying]);

  // Enhanced DICOM metadata extraction
  const extractDICOMMetadata = (image) => {
    try {
      const metadata = {};
      let pixelSpacingArray = [1, 1];

      if (image.data && image.data.string) {
        const pixelSpacingStr = image.data.string("x00280030");
        if (pixelSpacingStr) {
          const values = pixelSpacingStr.split("\\").map(v => parseFloat(v.trim()));
          if (values.length >= 2 && !isNaN(values[0]) && !isNaN(values[1]) && values[0] > 0 && values[1] > 0) {
            pixelSpacingArray = [values[0], values[1]];
          }
        }
      }

      if (pixelSpacingArray[0] === 1 && pixelSpacingArray[1] === 1) {
        try {
          const floatArray = image.data?.floatStringArray?.("x00280030");
          if (floatArray && floatArray.length >= 2 && floatArray[0] > 0 && floatArray[1] > 0) {
            pixelSpacingArray = [floatArray[0], floatArray[1]];
          }
        } catch (e) {
          console.warn("Could not extract pixel spacing using floatStringArray:", e);
        }
      }

      if (pixelSpacingArray[0] === 1 && pixelSpacingArray[1] === 1) {
        try {
          const imagerPixelSpacing = image.data?.string?.("x00181164");
          if (imagerPixelSpacing) {
            const values = imagerPixelSpacing.split("\\").map(v => parseFloat(v.trim()));
            if (values.length >= 2 && !isNaN(values[0]) && !isNaN(values[1]) && values[0] > 0 && values[1] > 0) {
              pixelSpacingArray = [values[0], values[1]];
            }
          }
        } catch (e) {
          console.warn("Could not extract imager pixel spacing:", e);
        }
      }

      if (pixelSpacingArray[0] <= 0 || pixelSpacingArray[1] <= 0) {
        console.warn("Invalid pixel spacing detected, using default [1, 1]");
        pixelSpacingArray = [1, 1];
      }

      metadata.pixelSpacing = pixelSpacingArray;

      metadata.studyDescription = image.data?.string?.("x00081030") || "Unknown Study";
      metadata.seriesDescription = image.data?.string?.("x0008103e") || "Unknown Series";
      metadata.patientName = image.data?.string?.("x00100010") || "Unknown Patient";
      metadata.patientId = image.data?.string?.("x00100020") || "Unknown ID";
      metadata.studyDate = image.data?.string?.("x00080020") || "";
      metadata.modality = image.data?.string?.("x00080060") || "Unknown";
      metadata.manufacturer = image.data?.string?.("x00080070") || "Unknown";
      metadata.institutionName = image.data?.string?.("x00080080") || "Unknown";
      metadata.imageColumns = image.width;
      metadata.imageRows = image.height;

      return metadata;
    } catch (error) {
      console.error("Error extracting DICOM metadata:", error);
      return {
        pixelSpacing: [1, 1],
        studyDescription: "Unknown Study",
        seriesDescription: "Unknown Series",
        patientName: "Unknown Patient",
        imageColumns: 512,
        imageRows: 512,
      };
    }
  };

  // Load DICOM images
  useEffect(() => {
    if (!files || !files.length) {
      console.warn("No files provided to DicomViewer");
      setIsImageLoaded(false);
      setPixelSpacing([1, 1]);
      setViewportScale({});
      setViewport({});
      setImageMetadata({});
      setMeasurements({});
      return;
    }

    let objectUrls = [];
    const imageIds = files
      .map((file) => {
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
      })
      .filter(Boolean);

    if (imageIds.length === 0) {
      setIsImageLoaded(false);
      return;
    }

    const viewerCount = getViewerCount(layout);

    for (let i = 0; i < viewerCount; i++) {
      const element = i === 0 ? viewerRef.current : viewerRefs.current[i]?.current;
      if (!element) continue;

      let isEnabled = false;
      try {
        cornerstone.getEnabledElement(element);
        isEnabled = true;
      } catch (e) {
        isEnabled = false;
      }

      if (!isEnabled) {
        try {
          cornerstone.enable(element);
          cornerstoneTools.addStackStateManager(element, ["stack"]);
          if (i === 0) {
            cornerstoneTools.setToolActive("Pan", { mouseButtonMask: 1 });
          }
        } catch (err) {
          console.error(`Failed to enable element ${i} during load:`, err);
          continue;
        }
      }

      const fileIndex = i % imageIds.length;
      const imageId = imageIds[fileIndex];

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

          const newViewport = cornerstone.getViewport(element) || {};

          if (i === 0) {
            const metadata = extractDICOMMetadata(image);
            if (
              metadata.pixelSpacing[0] * image.width < 24 ||
              metadata.pixelSpacing[1] * image.height < 24
            ) {
              console.warn("Pixel spacing adjusted for anatomical validation (eyeball ~24mm)");
              const scaleFactor = 24 / Math.max(
                image.width * metadata.pixelSpacing[0],
                image.height * metadata.pixelSpacing[1]
              );
              metadata.pixelSpacing = [
                metadata.pixelSpacing[0] * scaleFactor,
                metadata.pixelSpacing[1] * scaleFactor,
              ];
            }
            setPixelSpacing(metadata.pixelSpacing);
            setImageMetadata(metadata);
            setViewportScale((prev) => ({ ...prev, [i]: newViewport.scale || 1 }));
            setViewport((prev) => ({ ...prev, [i]: newViewport }));
            setIsImageLoaded(true);

            // TRACKING
            const file = files[fileIndex];
            const fileName = file.name || `Slice ${fileIndex + 1}`;
            AnalyticsTracker.trackFileView(fileName);

            const studyId = metadata.studyDescription || metadata.patientId || "unknown";
            AnalyticsTracker.trackStudyView(studyId);
          } else {
            setViewportScale((prev) => ({ ...prev, [i]: newViewport.scale || 1 }));
            setViewport((prev) => ({ ...prev, [i]: newViewport }));
          }

          switch (activeTool) {
            case "Pan": cornerstoneTools.setToolActive("Pan", { mouseButtonMask: 1 }); break;
            case "Zoom": cornerstoneTools.setToolActive("Zoom", { mouseButtonMask: 1 }); break;
            case "Rotate": cornerstoneTools.setToolActive("Rotate", { mouseButtonMask: 1 }); break;
            case "Wwwc": cornerstoneTools.setToolActive("Wwwc", { mouseButtonMask: 1 }); break;
            case "Measure": cornerstoneTools.setToolActive("Measure", { mouseButtonMask: 1 }); break;
            case "Magnify": cornerstoneTools.setToolActive("Magnify", { mouseButtonMask: 1 }); break;
            default: cornerstoneTools.setToolActive("Pan", { mouseButtonMask: 1 }); break;
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
  }, [files, layout, activeTool]);

  // Viewport change listener
  useEffect(() => {
    const viewerCount = getViewerCount(layout);

    const handleViewportChange = (index) => {
      const element = index === 0 ? viewerRef.current : viewerRefs.current[index]?.current;
      if (!element || !isImageLoaded) return;

      try {
        const newViewport = cornerstone.getViewport(element);
        if (newViewport) {
          setViewportScale((prev) => ({ ...prev, [index]: newViewport.scale || 1 }));
          setViewport((prev) => ({ ...prev, [index]: newViewport }));
        }
      } catch (err) {
        console.error(`Error getting viewport for viewer ${index}:`, err);
      }
    };

    for (let i = 0; i < viewerCount; i++) {
      const element = i === 0 ? viewerRef.current : viewerRefs.current[i]?.current;
      if (element) {
        element.addEventListener(cornerstone.EVENTS.IMAGE_RENDERED, () => handleViewportChange(i));
        element.addEventListener(cornerstone.EVENTS.NEW_IMAGE, () => handleViewportChange(i));
      }
    }

    return () => {
      for (let i = 0; i < viewerCount; i++) {
        const element = i === 0 ? viewerRef.current : viewerRefs.current[i]?.current;
        if (element) {
          element.removeEventListener(cornerstone.EVENTS.IMAGE_RENDERED, () => handleViewportChange(i));
          element.removeEventListener(cornerstone.EVENTS.NEW_IMAGE, () => handleViewportChange(i));
        }
      }
    };
  }, [isImageLoaded, layout]);

  // Measurement update
  useEffect(() => {
    if (!isImageLoaded || !isMeasuring) return;

    const viewerCount = getViewerCount(layout);

    const updateMeasurement = (index) => {
      const element = index === 0 ? viewerRef.current : viewerRefs.current[index]?.current;
      if (!element) return;

      try {
        const toolData = cornerstoneTools.getToolState(element, "Measure");
        if (toolData && toolData.data && toolData.data.length > 0) {
          const measurementData = toolData.data[toolData.data.length - 1];
          const start = measurementData.handles.start;
          const end = measurementData.handles.end;

          const deltaX = end.x - start.x;
          const deltaY = end.y - start.y;

          const mmX = deltaX * (pixelSpacing[1] || 1);
          const mmY = deltaY * (pixelSpacing[0] || 1);
          const distance = Math.sqrt(mmX * mmX + mmY * mmY);

          setMeasurements((prev) => ({ ...prev, [index]: distance > 0 ? distance : 0 }));
        } else {
          setMeasurements((prev) => ({ ...prev, [index]: null }));
        }
      } catch (err) {
        console.error(`Error updating measurement for viewer ${index}:`, err);
        setMeasurements((prev) => ({ ...prev, [index]: null }));
      }
    };

    for (let i = 0; i < viewerCount; i++) {
      const element = i === 0 ? viewerRef.current : viewerRefs.current[i]?.current;
      if (element) {
        updateMeasurement(i);
        const handleMeasurementChange = (event) => {
          if (event.detail && event.detail.toolName === "Measure") {
            updateMeasurement(i);
          }
        };

        element.addEventListener("cornerstonetoolsmeasurementadded", handleMeasurementChange);
        element.addEventListener("cornerstonetoolsmeasurementmodified", handleMeasurementChange);
        element.addEventListener("cornerstonetoolsmeasurementcompleted", handleMeasurementChange);

        return () => {
          element.removeEventListener("cornerstonetoolsmeasurementadded", handleMeasurementChange);
          element.removeEventListener("cornerstonetoolsmeasurementmodified", handleMeasurementChange);
          element.removeEventListener("cornerstonetoolsmeasurementcompleted", handleMeasurementChange);
        };
      }
    }
  }, [isImageLoaded, isMeasuring, activeTool, pixelSpacing, viewportScale, layout]);

  // Render viewers
  const renderViewers = () => {
    const [rows, cols] = layout.split("x").map(Number);
    const viewers = [];
    const viewerCount = rows * cols;

    const getViewerStyle = () => ({
      width: `${100 / cols}%`,
      height: `${100 / rows}%`,
    });

    const protocolPanel = (
      <div className="protocol-panel" draggable>
        <h3 className="protocol-panel-title">Protocol Panel</h3>
        {imageMetadata && (
          <div className="protocol-panel-metadata">
            <div><strong>Patient:</strong> {imageMetadata.patientName}</div>
            <div><strong>Study:</strong> {imageMetadata.studyDescription}</div>
            <div><strong>Series:</strong> {imageMetadata.seriesDescription}</div>
            <div><strong>Modality:</strong> {imageMetadata.modality}</div>
            <div><strong>Pixel Spacing:</strong></div>
            <div>Row: {pixelSpacing[0]?.toFixed(3)} mm</div>
            <div>Col: {pixelSpacing[1]?.toFixed(3)} mm</div>
          </div>
        )}
        {files.map((file, index) => {
          const hasSegments = segmentsByImage[index]?.length > 0;
          return (
            <div
              key={index}
              className={`protocol-panel-item ${index === 0 ? "active" : ""}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", index);
                setDraggedIndex(index);
              }}
              onClick={() => {
                // Optional: Click to load in primary viewer
                const element = viewerRef.current;
                if (element && files[index]) {
                  const imageId = `wadouri:${URL.createObjectURL(files[index])}`;
                  cornerstone.loadImage(imageId).then(img => cornerstone.displayImage(element, img));
                }
              }}
            >
              Image {index + 1} - {file.name || `Slice ${index + 1}`}
              {hasSegments && (
                <span style={{ marginLeft: '8px', color: '#4caf50', fontSize: '10px' }}>
                  {segmentsByImage[index].length} segment(s)
                </span>
              )}
            </div>
          );
        })}
      </div>
    );

    for (let i = 0; i < viewerCount; i++) {
      const isMainViewer = i === 0;
      viewers.push(
        <div
          key={`viewer-${i}`}
          ref={isMainViewer ? viewerRef : (el) => { if (viewerRefs.current[i]) viewerRefs.current[i].current = el; }}
          className="viewer"
          style={getViewerStyle()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const index = parseInt(e.dataTransfer.getData("text/plain"), 10);
            if (!isNaN(index) && index >= 0 && index < files.length) {
              setDroppedViewerIndex(i);
              const element = i === 0 ? viewerRef.current : viewerRefs.current[i]?.current;
              if (element && files[index]) {
                const imageId = `wadouri:${URL.createObjectURL(files[index])}`;
                cornerstone.loadImage(imageId).then((image) => {
                  cornerstone.displayImage(element, image);
                  cornerstone.updateImage(element);
                });
              }
            }
          }}
        >
          {isImageLoaded && (
            <div className="viewer-image-info viewer-image-info-top">
              Image {i + 1}
            </div>
          )}
          {isImageLoaded && (
            <div className="viewer-image-info viewer-image-info-bottom">
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
        <div className="viewers-container">
          {viewers}
          {isMeasuring && isImageLoaded && (
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "auto",
              zIndex: 10
            }}>
              <MeasurementTool
                containerWidth={containerHeight}
                containerHeight={containerHeight}
                pixelSpacings={Object.fromEntries(
                  Object.keys(viewport).map(key => [
                    key, 
                    imageMetadata?.pixelSpacing || pixelSpacing || [1, 1]
                  ])
                )}
                viewports={viewport}
                imageMetadata={Object.fromEntries(
                  Object.keys(viewport).map(key => [
                    key,
                    {
                      imageColumns: imageMetadata?.imageColumns || 512,
                      imageRows: imageMetadata?.imageRows || 512,
                      pixelSpacing: imageMetadata?.pixelSpacing || pixelSpacing || [1, 1]
                    }
                  ])
                )}
                layout={layout}
              />
            </div>
          )}
        </div>
      </>
    );
  };

  const containerHeight = 750;

  return (
    <div className="dicom-viewer-container">
      {/* FULL WIDTH RESPONSIVE HEADER */}
      <div className="header-container">
        <Button
          variant="contained"
          startIcon={<ArrowBack />}
          sx={{
            backgroundColor: "#020079",
            color: "#ffffff",
            "&:hover": { backgroundColor: "#020079", opacity: 0.9 },
            borderRadius: "8px",
            minWidth: "120px",
          }}
          onClick={() => navigate("/")}
        >
          Back to PACS
        </Button>
        <h1 className="dicom-viewer-title">DICOM Viewer with MPR</h1>
      </div>

      <div className="toolbar-and-viewer-container">
        <div className="toolbar-container">
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
            isMeasuring={isMeasuring}
            setIsMeasuring={setIsMeasuring}
          />
        </div>

        <div className="viewers-wrapper" style={{ width: "100%", height: containerHeight }}>
          {renderViewers()}

          {/* Segmentation Tool */}
          {showSegmentation && isImageLoaded && (
            <Segmentation
              viewerRef={viewerRef}
              isElementEnabled={!!viewerRef.current}
              isImageLoaded={isImageLoaded}
              isSegmentationActive={showSegmentation}
              segmentsProp={getCurrentSegments()}
              onSegmentsChange={handleSegmentsChange}
              onClose={(updatedSegments) => {
                if (updatedSegments) handleSegmentsChange(updatedSegments);
                setShowSegmentation(false);
              }}
              imageIndex={0}
              files={files}
            />
          )}
        </div>
      </div>

      {/* MPR */}
      {showMPR && (
        <MultiplanarReconstruction
          viewerRef={viewerRef}
          files={files}
          isElementEnabled={!!viewerRef.current}
          isImageLoaded={isImageLoaded}
          onClose={() => setShowMPR(false)}
          disabled={isPlaying}
          currentIndex={0}
        />
      )}

      {/* Measurements Display */}
      {isMeasuring && isImageLoaded && (
        <div className="measurements-container">
          {Object.entries(measurements).map(([index, meas]) =>
            meas !== null ? (
              <Typography key={index} className="measurement-text">
                Viewer {parseInt(index) + 1}: {meas.toFixed(2)} mm
              </Typography>
            ) : null
          )}
        </div>
      )}

      {/* Info Overlays */}
      {isImageLoaded && pixelSpacing && (
        <Typography variant="caption" className="info-text info-text-pixel-spacing">
          Pixel Spacing: {pixelSpacing[0]?.toFixed(3)} × {pixelSpacing[1]?.toFixed(3)} mm/pixel
        </Typography>
      )}

      {isImageLoaded && (
        <Typography variant="caption" className="info-text info-text-scale">
          Scale: {(viewportScale[0] * 100 || 100).toFixed(1)}%
        </Typography>
      )}

      {isImageLoaded && imageMetadata && (
        <Typography variant="caption" className="info-text info-text-metadata">
          {imageMetadata.modality} - {imageMetadata.seriesDescription}
        </Typography>
      )}
    </div>
  );
}

export default DicomViewer;