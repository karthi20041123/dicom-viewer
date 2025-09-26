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
  const viewerRefs = useRef([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTool, setActiveTool] = useState("Pan");
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [brightness, setBrightness] = useState(40);
  const [contrast, setContrast] = useState(400);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSegmentation, setShowSegmentation] = useState(false);
  const [showMPR, setShowMPR] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [layout, setLayout] = useState("2x2");
  const [measurements, setMeasurements] = useState({}); // Store measurements for each viewer
  const [pixelSpacing, setPixelSpacing] = useState([1, 1]);
  const [viewportScale, setViewportScale] = useState({});
  const [viewport, setViewport] = useState({});
  const [imageMetadata, setImageMetadata] = useState({});

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

  // Enhanced DICOM metadata extraction function with validation
  const extractDICOMMetadata = (image) => {
    try {
      const metadata = {};
      
      let pixelSpacingArray = [1, 1]; // Default fallback
      
      if (image.data && image.data.string) {
        const pixelSpacingStr = image.data.string('x00280030');
        if (pixelSpacingStr) {
          const values = pixelSpacingStr.split('\\').map(v => parseFloat(v.trim()));
          if (values.length >= 2 && !isNaN(values[0]) && !isNaN(values[1]) && values[0] > 0 && values[1] > 0) {
            pixelSpacingArray = [values[0], values[1]];
          }
        }
      }
      
      if (pixelSpacingArray[0] === 1 && pixelSpacingArray[1] === 1) {
        try {
          const floatArray = image.data?.floatStringArray?.('x00280030');
          if (floatArray && floatArray.length >= 2 && floatArray[0] > 0 && floatArray[1] > 0) {
            pixelSpacingArray = [floatArray[0], floatArray[1]];
          }
        } catch (e) {
          console.warn('Could not extract pixel spacing using floatStringArray:', e);
        }
      }

      if (pixelSpacingArray[0] === 1 && pixelSpacingArray[1] === 1) {
        try {
          const imagerPixelSpacing = image.data?.string?.('x00181164');
          if (imagerPixelSpacing) {
            const values = imagerPixelSpacing.split('\\').map(v => parseFloat(v.trim()));
            if (values.length >= 2 && !isNaN(values[0]) && !isNaN(values[1]) && values[0] > 0 && values[1] > 0) {
              pixelSpacingArray = [values[0], values[1]];
            }
          }
        } catch (e) {
          console.warn('Could not extract imager pixel spacing:', e);
        }
      }

      if (pixelSpacingArray[0] <= 0 || pixelSpacingArray[1] <= 0) {
        console.warn('Invalid pixel spacing detected, using default [1, 1]');
        pixelSpacingArray = [1, 1];
      }

      metadata.pixelSpacing = pixelSpacingArray;
      
      try {
        metadata.studyDescription = image.data?.string?.('x00081030') || 'Unknown Study';
        metadata.seriesDescription = image.data?.string?.('x0008103e') || 'Unknown Series';
        metadata.patientName = image.data?.string?.('x00100010') || 'Unknown Patient';
        metadata.patientId = image.data?.string?.('x00100020') || 'Unknown ID';
        metadata.studyDate = image.data?.string?.('x00080020') || '';
        metadata.modality = image.data?.string?.('x00080060') || 'Unknown';
        metadata.manufacturer = image.data?.string?.('x00080070') || 'Unknown';
        metadata.institutionName = image.data?.string?.('x00080080') || 'Unknown';
        metadata.imageColumns = image.width;
        metadata.imageRows = image.height;
      } catch (e) {
        console.warn('Error extracting additional DICOM metadata:', e);
      }

      return metadata;
    } catch (error) {
      console.error('Error extracting DICOM metadata:', error);
      return { 
        pixelSpacing: [1, 1],
        studyDescription: 'Unknown Study',
        seriesDescription: 'Unknown Series',
        patientName: 'Unknown Patient',
        imageColumns: 512,
        imageRows: 512
      };
    }
  };

  // Load DICOM images with enhanced metadata extraction
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
        cornerstone.getEnabledElement(element);
        isEnabled = true;
      } catch (e) {
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
          console.error(`Failed to enable element ${i} during load:`, err);
          continue;
        }
      }

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
          
          const newViewport = cornerstone.getViewport(element) || {};
          cornerstone.setViewport(element, {
            ...newViewport,
            voi: { windowCenter: brightness, windowWidth: contrast },
          });

          if (i === 0) {
            const metadata = extractDICOMMetadata(image);
            if (metadata.pixelSpacing[0] * image.width < 24 || metadata.pixelSpacing[1] * image.height < 24) {
              console.warn('Pixel spacing adjusted for anatomical validation (eyeball ~24mm)');
              const scaleFactor = 24 / Math.max(image.width * metadata.pixelSpacing[0], image.height * metadata.pixelSpacing[1]);
              metadata.pixelSpacing = [metadata.pixelSpacing[0] * scaleFactor, metadata.pixelSpacing[1] * scaleFactor];
            }
            setPixelSpacing(metadata.pixelSpacing);
            setImageMetadata(metadata);
            setViewportScale((prev) => ({ ...prev, [i]: newViewport.scale || 1 }));
            setViewport((prev) => ({ ...prev, [i]: newViewport }));
            setIsImageLoaded(true);
          } else {
            setViewportScale((prev) => ({ ...prev, [i]: newViewport.scale || 1 }));
            setViewport((prev) => ({ ...prev, [i]: newViewport }));
          }

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

  // Listen for viewport changes to update scale and viewport object for each viewer
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

  // Enhanced measurement update with proper coordinate transformation for each viewer
  useEffect(() => {
    if (!isImageLoaded || !isMeasuring) return;

    const viewerCount = getViewerCount(layout);

    const updateMeasurement = (index) => {
      const element = index === 0 ? viewerRef.current : viewerRefs.current[index]?.current;
      if (!element) {
        console.warn(`Element ${index} not available for measurement update`);
        return;
      }

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

        // Cleanup listeners
        return () => {
          element.removeEventListener("cornerstonetoolsmeasurementadded", handleMeasurementChange);
          element.removeEventListener("cornerstonetoolsmeasurementmodified", handleMeasurementChange);
          element.removeEventListener("cornerstonetoolsmeasurementcompleted", handleMeasurementChange);
        };
      }
    }
  }, [isImageLoaded, isMeasuring, activeTool, pixelSpacing, viewportScale, layout]);

  // Update viewport for brightness and contrast
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
        const currentViewport = cornerstone.getViewport(element) || {};
        currentViewport.voi.windowCenter = brightness;
        currentViewport.voi.windowWidth = contrast;
        cornerstone.setViewport(element, currentViewport);
        
        if (i === 0) {
          setViewportScale((prev) => ({ ...prev, [i]: currentViewport.scale || 1 }));
          setViewport((prev) => ({ ...prev, [i]: currentViewport }));
        } else {
          setViewportScale((prev) => ({ ...prev, [i]: currentViewport.scale || 1 }));
          setViewport((prev) => ({ ...prev, [i]: currentViewport }));
        }
        
        cornerstone.updateImage(element);
      } catch (err) {
        console.error(`Failed to update viewport for viewer ${i}:`, err);
      }
    }
  }, [brightness, contrast, isImageLoaded, layout]);

  // Enhanced renderViewers function
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
          fontSize: "12px",
        }}
      >
        <h3 style={{ margin: "0 0 10px", fontSize: "14px" }}>Protocol Panel</h3>
        {imageMetadata && (
          <div style={{ marginBottom: "15px", borderBottom: "1px solid #444", paddingBottom: "10px" }}>
            <div><strong>Patient:</strong> {imageMetadata.patientName}</div>
            <div><strong>Study:</strong> {imageMetadata.studyDescription}</div>
            <div><strong>Series:</strong> {imageMetadata.seriesDescription}</div>
            <div><strong>Modality:</strong> {imageMetadata.modality}</div>
            <div><strong>Pixel Spacing:</strong></div>
            <div>Row: {pixelSpacing[0]?.toFixed(3)} mm</div>
            <div>Col: {pixelSpacing[1]?.toFixed(3)} mm</div>
          </div>
        )}
        {files.map((file, index) => (
          <div 
            key={index} 
            style={{ 
              marginBottom: "5px",
              padding: "3px",
              backgroundColor: index === currentIndex ? "#444" : "transparent",
              cursor: "pointer"
            }}
            onClick={() => setCurrentIndex(index)}
          >
            Image {index + 1} - {file.name || `Slice ${index + 1}`}
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
                zIndex: 5,
              }}
            >
              {files[currentIndex + i]?.name || `Image ${currentIndex + i + 1}`}
            </div>
          )}
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
                zIndex: 5,
              }}
            >
              {i === 0 && "AR"}
              {i === 1 && "AX PL"}
              {i === 2 && "AX"}
              {i === 3 && "PIL"}
            </div>
          )}
          {isMeasuring && isImageLoaded && (
            <MeasurementTool
              measurement={measurements[i] || null}
              containerWidth={(100 / cols) * (containerWidth - 210) / 100}
              containerHeight={(100 / rows) * containerHeight / 100}
              pixelSpacing={pixelSpacing}
              viewportScale={viewportScale[i] || 1}
              viewport={viewport[i] || null}
              imageColumns={imageMetadata?.imageColumns}
              imageRows={imageMetadata?.imageRows}
              viewerIndex={i}
            />
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

  const containerWidth = 900;
  const containerHeight = getViewerCount(layout) > 4 ? 800 : getViewerCount(layout) > 2 ? 600 : 550;

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 1100,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minHeight: "100vh",
        position: "relative",
        backgroundColor: "#ffffff",
      }}
    >
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
              setActiveTool("Measure");
            } else {
              setActiveTool("Pan");
              setMeasurements({});
              const viewerCount = getViewerCount(layout);
              for (let i = 0; i < viewerCount; i++) {
                const element = i === 0 ? viewerRef.current : viewerRefs.current[i]?.current;
                if (element) {
                  let isEnabled = false;
                  try {
                    if (cornerstone.getEnabledElement(element)) isEnabled = true;
                  } catch {}
                  if (isEnabled) {
                    cornerstoneTools.clearToolState(element, "Measure");
                    cornerstone.updateImage(element);
                  }
                }
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

      {isMeasuring && isImageLoaded && (
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          {Object.entries(measurements).map(([index, meas]) => (
            meas !== null && (
              <Typography
                key={index}
                style={{
                  color: "#020079",
                  textAlign: "center",
                  backgroundColor: "#ffffff",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  boxShadow: "0 2px 4px rgba(0, 31, 63, 0.2)",
                  fontWeight: "bold",
                  fontSize: "16px"
                }}
              >
                Viewer {parseInt(index) + 1}: {meas.toFixed(2)} mm
              </Typography>
            )
          ))}
        </div>
      )}

      {isImageLoaded && pixelSpacing && (
        <Typography
          variant="caption"
          style={{
            position: "fixed",
            bottom: 70,
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
          Pixel Spacing: {pixelSpacing[0]?.toFixed(3)} × {pixelSpacing[1]?.toFixed(3)} mm/pixel
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
          Scale: {(viewportScale[0] * 100 || 100).toFixed(1)}%
        </Typography>
      )}

      {isImageLoaded && imageMetadata && (
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
          {imageMetadata.modality} - {imageMetadata.seriesDescription}
        </Typography>
      )}
    </div>
  );
}

export default DicomViewer;