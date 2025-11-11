import React, { useState, useEffect, useCallback } from "react";
import {
  Button,
  ButtonGroup,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  Slider,
  Typography,
  Box,
} from "@mui/material";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneTools from "cornerstone-tools";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import PanControls from "./tools/PanControls";
import ZoomControls from "./tools/ZoomControls";
import RotateMenu from "./tools/RotateControls";
import WindowLevelControls from "./tools/WindowlevelControls";
import Measurement from "./tools/Measurement";
import Magnifier from "./tools/Magnifier";
import CinePlayer from "./tools/CinePlayer";
import LayoutControls from "./tools/LayoutControls";
import Segmentation from "./tools/Segmentation";
import SharedView from "./tools/SharedView";
import "./styles/Toolbar.css";
import PanToolIcon from '@mui/icons-material/PanTool';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import ExposureIcon from '@mui/icons-material/Exposure';
import StraightenIcon from '@mui/icons-material/Straighten';
import SearchIcon from '@mui/icons-material/Search';
import BrushIcon from '@mui/icons-material/Brush';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DownloadIcon from '@mui/icons-material/Download';
import ShareIcon from '@mui/icons-material/Share';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import Brightness6Icon from '@mui/icons-material/Brightness6';

// ANALYTICS TRACKER
import { AnalyticsTracker } from './AnalyticsDashboard';

const Toolbar = ({
  activeTool,
  handleToolChange,
  viewerRef,
  viewerRefs,
  files,
  isElementEnabled,
  isImageLoaded,
  isPlaying,
  setIsPlaying,
  onLayoutChange,
  mprMode,
  setMprMode,
  isMeasuring,
  setIsMeasuring,
  layout,
}) => {
  const [showMeasurement, setShowMeasurement] = useState(false);
  const [showSegmentation, setShowSegmentation] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [exportAnchorEl, setExportAnchorEl] = useState(null);
  const [mprAnchorEl, setMprAnchorEl] = useState(null);
  const openExportMenu = Boolean(exportAnchorEl);
  const openMprMenu = Boolean(mprAnchorEl);
  const [isMagnifierActive, setIsMagnifierActive] = useState(false);

  // --- Brightness/Contrast State ---
  const [openBCDialog, setOpenBCDialog] = useState(false);
  const [sliderBrightness, setSliderBrightness] = useState(100);
  const [sliderContrast, setSliderContrast] = useState(400);

  // Map UI slider (1–200) to real windowCenter (-500 to +500)
  const getWindowCenter = () => {
    const min = -500;
    const max = 500;
    return min + ((sliderBrightness - 1) / 199) * (max - min);
  };

  const getSliderBrightness = (center) => {
    const min = -500;
    const max = 500;
    const normalized = (center - min) / (max - min);
    return Math.round(1 + normalized * 199);
  };

  /* ------------------------------------------------------------------ */
  /* HELPER: Get total viewer count */
  /* ------------------------------------------------------------------ */
  const getViewerCount = useCallback((layoutStr) => {
    if (!layoutStr) return 1;
    const [rows, cols] = layoutStr.split('x').map(Number);
    return rows * cols;
  }, []);

  /* ------------------------------------------------------------------ */
  /* CENTRAL TOOL ACTIVATION */
  /* ------------------------------------------------------------------ */
  const activateTool = (toolName) => {
    if (isPlaying || !isImageLoaded) return;

    setIsMagnifierActive(false);
    setShowMeasurement(false);
    setShowSegmentation(false);
    setOpenBCDialog(false);
    setIsMeasuring(false);

    if (activeTool === toolName) {
      handleToolChangeWithTracking('Pan');
      return;
    }

    handleToolChangeWithTracking(toolName);

    if (toolName === 'Magnify') setIsMagnifierActive(true);
    if (toolName === 'Measure') {
      setShowMeasurement(true);
      setIsMeasuring(true);
    }
    if (toolName === 'Segmentation') setShowSegmentation(true);
    if (toolName === 'BrightnessContrast') handleOpenBCDialog();
  };

  const handleToolChangeWithTracking = (toolName) => {
    handleToolChange(toolName);
    AnalyticsTracker.trackToolUsage(toolName);
  };

  /* ------------------------------------------------------------------ */
  /* FILE VIEW TRACKING */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (files && files.length > 0) {
      files.forEach(file => AnalyticsTracker.trackFileView(file.name));
    }
    return () => AnalyticsTracker.trackFileViewEnd();
  }, [files]);

  /* ------------------------------------------------------------------ */
  /* IMAGE LOAD TIME TRACKING */
  /* ------------------------------------------------------------------ */
  const trackImageLoadTime = (start) => {
    const loadTime = Date.now() - start;
    AnalyticsTracker.trackLoadTime(loadTime);
  };

  /* ------------------------------------------------------------------ */
  /* UPDATE VIEWPORT FOR ALL VIEWERS (B/C) */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!isImageLoaded) return;

    const windowCenter = getWindowCenter();
    const windowWidth = sliderContrast;

    const viewerCount = getViewerCount(layout);
    for (let i = 0; i < viewerCount; i++) {
      const element = i === 0 ? viewerRef.current : viewerRefs?.current?.[i]?.current;
      if (!element) continue;

      try {
        const vp = cornerstone.getViewport(element) || {};
        vp.voi = vp.voi || {};
        vp.voi.windowCenter = windowCenter;
        vp.voi.windowWidth = windowWidth;
        cornerstone.setViewport(element, vp);
        cornerstone.updateImage(element);
      } catch (err) {
        console.error(`Failed to update viewport for viewer ${i}:`, err);
      }
    }
  }, [
    sliderBrightness,
    sliderContrast,
    isImageLoaded,
    layout,
    viewerRef,
    viewerRefs,
    getViewerCount,
  ]);

  /* ------------------------------------------------------------------ */
  /* RESET */
  /* ------------------------------------------------------------------ */
  const handleReset = () => {
    if (!viewerRef?.current || isPlaying) return;
    try {
      const viewerCount = getViewerCount(layout);
      for (let i = 0; i < viewerCount; i++) {
        const el = i === 0 ? viewerRef.current : viewerRefs?.current?.[i]?.current;
        if (el) cornerstone.reset(el);
      }
      setSliderBrightness(100);
      setSliderContrast(400);
      activateTool('Pan');
      AnalyticsTracker.trackToolUsage('Reset');
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  /* ------------------------------------------------------------------ */
  /* OPEN BRIGHTNESS/CONTRAST DIALOG */
  /* ------------------------------------------------------------------ */
  const handleOpenBCDialog = () => {
    const element = viewerRef?.current;
    if (!element || !isImageLoaded) return;

    try {
      const vp = cornerstone.getViewport(element);
      if (vp?.voi) {
        const center = vp.voi.windowCenter ?? 0;
        const width = vp.voi.windowWidth ?? 400;
        setSliderBrightness(getSliderBrightness(center));
        setSliderContrast(Math.max(1, Math.min(2000, Math.round(width))));
      }
    } catch (err) {
      console.warn("Failed to read initial viewport:", err);
      setSliderBrightness(100);
      setSliderContrast(400);
    }

    setOpenBCDialog(true);
  };

  const handleCloseBCDialog = () => {
    setOpenBCDialog(false);
    if (activeTool === 'BrightnessContrast') activateTool('Pan');
  };

  /* ------------------------------------------------------------------ */
  /* MPR MODE SELECT */
  /* ------------------------------------------------------------------ */
  const handleMPRModeSelect = (mode) => {
    setMprMode(mode);
    setMprAnchorEl(null);
    AnalyticsTracker.trackToolUsage(`MPR-${mode || 'Off'}`);
  };

  /* ------------------------------------------------------------------ */
  /* SHARE TOGGLE */
  /* ------------------------------------------------------------------ */
  const handleShareToggle = () => {
    setShowShareDialog(prev => !prev);
    AnalyticsTracker.trackToolUsage('Share');
  };

  /* ------------------------------------------------------------------ */
  /* LAYOUT CHANGE HANDLER */
  /* ------------------------------------------------------------------ */
  const handleLayoutChange = (newLayout) => {
    onLayoutChange(newLayout);
    AnalyticsTracker.trackToolUsage(`Layout-${newLayout}`);
  };

  /* ------------------------------------------------------------------ */
  /* EXPORT - FIXED: Uses cornerstone image, not DOM canvas */
  /* ------------------------------------------------------------------ */
  const handleExportFormat = async (format) => {
    if (!files?.length) {
      alert("No files to export!");
      return;
    }

    const zip = new JSZip();
    const exportedFiles = [];

    // Create a hidden canvas for rendering
    const hiddenCanvas = document.createElement("canvas");
    const ctx = hiddenCanvas.getContext("2d");

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;

      try {
        if (format === "dicom") {
          const buffer = await file.arrayBuffer();
          const fileName = file.name || `image_${i}.dcm`;
          zip.file(fileName, buffer);
          exportedFiles.push(fileName);
        } else {
          // Load image via Cornerstone
          const imageId = `dicomweb:${URL.createObjectURL(file)}`;
          const image = await cornerstone.loadAndCacheImage(imageId);

          // Set canvas size to image
          hiddenCanvas.width = image.width;
          hiddenCanvas.height = image.height;

          // Render image to canvas
          cornerstone.renderToCanvas(hiddenCanvas, image);

          // Convert to blob
          const blob = await new Promise(resolve => {
            hiddenCanvas.toBlob(resolve, format === "png" ? "image/png" : "image/jpeg", 0.95);
          });

          const fileName = file.name.replace(/\.[^/.]+$/, "") + (format === "png" ? ".png" : ".jpg");
          zip.file(fileName, blob);
          exportedFiles.push(fileName);
        }
      } catch (err) {
        console.warn(`Export failed for ${file.name}:`, err);
      }
    }

    setExportAnchorEl(null);
    AnalyticsTracker.trackToolUsage(`Export-${format.toUpperCase()}`);

    if (exportedFiles.length === 0) {
      alert("No files were exported!");
      return;
    }

    if (files.length === 1) {
      if (format === "dicom") {
        saveAs(new Blob([await files[0].arrayBuffer()]), files[0].name || "image.dcm");
      } else {
        hiddenCanvas.toBlob(blob => saveAs(blob, exportedFiles[0]), format === "png" ? "image/png" : "image/jpeg");
      }
    } else {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `exported_series_${new Date().toISOString().split('T')[0]}.zip`);
    }
  };

  /* ------------------------------------------------------------------ */
  /* CINE PLAYER */
  /* ------------------------------------------------------------------ */
  const handleCineToggle = () => {
    const newState = !isPlaying;
    setIsPlaying(newState);
    AnalyticsTracker.trackToolUsage('Cine');
    if (newState) activateTool('Pan');
  };

  return (
    <>
      <div className="toolbar-container">
        <ButtonGroup variant="contained" className="toolbar-button-group">
          <Button
            onClick={(e) => setMprAnchorEl(e.currentTarget)}
            disabled={isPlaying || !isImageLoaded}
            className="mpr-button"
            startIcon={<FormatListNumberedIcon />}
            style={{ background: mprMode ? '#4caf50' : '#1a237e', color: 'white' }}
          >
            MPR
          </Button>

          <WindowLevelControls
            viewerRef={viewerRef}
            disabled={isPlaying}
            onActivate={() => activateTool('Wwwc')}
            isActive={activeTool === 'Wwwc'}
          />

          <PanControls
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChangeWithTracking}
            disabled={isPlaying}
            startIcon={<PanToolIcon />}
            isActive={activeTool === 'Pan'}
            onActivate={() => activateTool('Pan')}
          />

          <ZoomControls
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChangeWithTracking}
            disabled={isPlaying}
            startIcon={<ZoomInIcon />}
            isActive={activeTool === 'Zoom'}
            onActivate={() => activateTool('Zoom')}
          />

          <RotateMenu
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChangeWithTracking}
            disabled={isPlaying}
            startIcon={<RotateRightIcon />}
            isActive={activeTool === 'Rotate'}
            onActivate={() => activateTool('Rotate')}
          />

          <Magnifier viewerRef={viewerRef} isActive={isMagnifierActive} disabled={isPlaying} />
          <Button
            variant="contained"
            onClick={() => activateTool('Magnify')}
            disabled={isPlaying || !isImageLoaded}
            className="magnifier-button"
            startIcon={<SearchIcon />}
            sx={{
              backgroundColor: "#1a237e",
              color: "white",
              borderRadius: "8px",
              textTransform: "none",
              transition: "background-color 0.3s ease",
              "&:hover": { backgroundColor: "#001f3f" },
            }}
          >
            Magnifier
          </Button>

          <Button
            variant="contained"
            onClick={() => activateTool('Measure')}
            disabled={isPlaying || !isImageLoaded}
            className="measure-button"
            startIcon={<StraightenIcon />}
            sx={{
              backgroundColor: "#1a237e",
              color: "white",
              borderRadius: "8px",
              textTransform: "none",
              transition: "background-color 0.3s ease",
              "&:hover": { backgroundColor: "#001f3f" },
            }}
          >
            Measure
          </Button>

          <Button
            variant="contained"
            onClick={() => activateTool('Segmentation')}
            disabled={isPlaying || !isImageLoaded}
            className="segmentation-button"
            startIcon={<BrushIcon />}
            sx={{
              backgroundColor: "#1a237e",
              color: "white",
              borderRadius: "8px",
              textTransform: "none",
              transition: "background-color 0.3s ease",
              "&:hover": { backgroundColor: "#001f3f" },
            }}
          >
            Segmentation
          </Button>

          <Button
            variant="contained"
            onClick={() => activateTool('BrightnessContrast')}
            disabled={isPlaying || !isImageLoaded}
            className="bc-button"
            startIcon={<Brightness6Icon />}
            sx={{
              backgroundColor: "#1a237e",
              color: "white",
              borderRadius: "8px",
              textTransform: "none",
              transition: "background-color 0.3s ease",
              "&:hover": { backgroundColor: "#001f3f" },
            }}
          >
            B/C
          </Button>

          <LayoutControls
            onLayoutChange={handleLayoutChange}
            currentLayout={layout}
          />

          <Button
            onClick={handleReset}
            disabled={isPlaying}
            className="reset-button"
            startIcon={<RestartAltIcon />}
          >
            Reset
          </Button>

          <Button
            onClick={(e) => setExportAnchorEl(e.currentTarget)}
            disabled={isPlaying}
            className="export-button"
            startIcon={<DownloadIcon />}
          >
            Export
          </Button>

          <CinePlayer
            viewerRef={viewerRef}
            files={files}
            isPlaying={isPlaying}
            setIsPlaying={handleCineToggle}
            startIcon={<PlayArrowIcon />}
          />
        </ButtonGroup>

        {/* MPR MENU */}
        <Menu
          anchorEl={mprAnchorEl}
          open={openMprMenu}
          onClose={() => setMprAnchorEl(null)}
          className="mpr-menu"
        >
          <MenuItem onClick={() => handleMPRModeSelect("orthogonal")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>Orthogonal</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + M</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("axial")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>Axial</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + A</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("coronal")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>Coronal</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + C</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("sagittal")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>Sagittal</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + S</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("mist_oblique")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>MIST Oblique</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + Q</span>
          </MenuItem>
        </Menu>

        {/* EXPORT MENU */}
        <Menu
          anchorEl={exportAnchorEl}
          open={openExportMenu}
          onClose={() => setExportAnchorEl(null)}
          className="export-menu"
        >
          <MenuItem onClick={() => handleExportFormat("png")} disabled={isPlaying}>
            PNG
          </MenuItem>
          <MenuItem onClick={() => handleExportFormat("jpg")} disabled={isPlaying}>
            JPG
          </MenuItem>
          <MenuItem onClick={() => handleExportFormat("dicom")} disabled={isPlaying}>
            DICOM
          </MenuItem>
        </Menu>
      </div>

      {/* SEGMENTATION PANEL */}
      {showSegmentation && (
        <Segmentation
          viewerRef={viewerRef}
          isElementEnabled={isElementEnabled}
          isImageLoaded={isImageLoaded}
          isSegmentationActive={activeTool === "Segmentation"}
          disabled={isPlaying}
          onClose={() => activateTool('Pan')}
        />
      )}

      {/* BRIGHTNESS & CONTRAST DIALOG */}
      {openBCDialog && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            left: '20px',
            zIndex: 9999,
            pointerEvents: 'auto',
          }}
        >
          <Box
            sx={{
              width: '320px',
              bgcolor: '#2d2d2d',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            }}
          >
            <Box
              sx={{
                bgcolor: '#ff4949ff',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '1rem',
                textAlign: 'left',
                py: 1.5,
                px: 2,
                position: 'relative',
                fontFamily: 'LemonMilk, sans-serif',
                borderBottom: '1px solid #444',
              }}
            >
              BRIGHTNESS & CONTRAST
              <Button
                onClick={() => {
                  setSliderBrightness(100);
                  setSliderContrast(400);
                }}
                size="small"
                sx={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  minWidth: '60px',
                  fontFamily: 'LemonMilk, sans-serif',
                  fontSize: '11px',
                  textTransform: 'none',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.2)' },
                }}
              >
                RESET
              </Button>
            </Box>

            <Box sx={{ bgcolor: '#2d2d2d', p: 3 }}>
              <Typography
                sx={{
                  color: '#fff',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  mb: 1,
                  mt: 2,
                  userSelect: 'none',
                  fontFamily: 'LemonMilk, sans-serif',
                }}
              >
                Brightness: {sliderBrightness}
              </Typography>
              <Slider
                value={sliderBrightness}
                min={1}
                max={200}
                step={1}
                onChange={(e, val) => setSliderBrightness(val)}
                disabled={isPlaying}
                sx={{
                  color: '#5b6ad0',
                  height: 8,
                  '& .MuiSlider-track': { backgroundColor: '#5b6ad0', border: 'none' },
                  '& .MuiSlider-rail': { backgroundColor: '#444', opacity: 1 },
                  '& .MuiSlider-thumb': {
                    backgroundColor: '#5b6ad0',
                    width: 16,
                    height: 16,
                    '&:hover, &.Mui-focusVisible': {
                      boxShadow: '0 0 0 8px rgba(91, 106, 208, 0.16)',
                    },
                  },
                }}
              />

              <Typography
                sx={{
                  color: '#fff',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  mb: 1,
                  mt: 3,
                  userSelect: 'none',
                  fontFamily: 'LemonMilk, sans-serif',
                }}
              >
                Contrast: {sliderContrast}
              </Typography>
              <Slider
                value={sliderContrast}
                min={1}
                max={2000}
                step={1}
                onChange={(e, val) => setSliderContrast(val)}
                disabled={isPlaying}
                sx={{
                  color: '#5b6ad0',
                  height: 8,
                  '& .MuiSlider-track': { backgroundColor: '#5b6ad0', border: 'none' },
                  '& .MuiSlider-rail': { backgroundColor: '#444', opacity: 1 },
                  '& .MuiSlider-thumb': {
                    backgroundColor: '#5b6ad0',
                    width: 16,
                    height: 16,
                    '&:hover, &.Mui-focusVisible': {
                      boxShadow: '0 0 0 8px rgba(91, 106, 208, 0.16)',
                    },
                  },
                }}
              />

              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Button
                  onClick={handleCloseBCDialog}
                  variant="contained"
                  sx={{
                    bgcolor: '#4caf50',
                    color: '#fff',
                    fontFamily: 'LemonMilk, sans-serif',
                    fontSize: '12px',
                    textTransform: 'none',
                    px: 4,
                    py: 1,
                    fontWeight: 'bold',
                    '&:hover': { bgcolor: '#43a047' },
                  }}
                >
                  APPLY
                </Button>
              </Box>
            </Box>
          </Box>
        </div>
      )}
    </>
  );
};

export default Toolbar;