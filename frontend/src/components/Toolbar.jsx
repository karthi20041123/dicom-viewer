import React, { useState, useEffect } from "react";
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
import ZoomControls from "./tools/ZoomControls"; // Fixed: was "Zoom | ZoomControls"
import RotateMenu from "./tools/RotateControls";
import WindowLevelControls from "./tools/WindowlevelControls";
import Measurement from "./tools/Measurement";
import Magnifier from "./tools/Magnifier";
import CinePlayer from "./tools/CinePlayer";
import PanelControls from "./tools/PanelControls";
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
import ViewModuleIcon from '@mui/icons-material/ViewModule';
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

  // --- Brightness/Contrast State (UI: 1–200 for brightness, 1–2000 for contrast) ---
  const [openBCDialog, setOpenBCDialog] = useState(false);
  const [sliderBrightness, setSliderBrightness] = useState(100); // UI: 1–200
  const [sliderContrast, setSliderContrast] = useState(400);     // UI: 1–2000

  // Map UI slider (1–200) → real windowCenter (-500 to +500)
  const getWindowCenter = () => {
    const min = -500;
    const max = 500;
    return min + ((sliderBrightness - 1) / 199) * (max - min);
  };

  // Map real windowCenter → UI slider value
  const getSliderBrightness = (center) => {
    const min = -500;
    const max = 500;
    const normalized = (center - min) / (max - min);
    return Math.round(1 + normalized * 199);
  };

  /* ------------------------------------------------------------------ */
  /* HELPER: Get total viewer count from layout string */
  /* ------------------------------------------------------------------ */
  const getViewerCount = (layoutStr) => {
    if (!layoutStr) return 1;
    const [rows, cols] = layoutStr.split('x').map(Number);
    return rows * cols;
  };

  /* ------------------------------------------------------------------ */
  /* CENTRAL TOOL CHANGE + TRACKING */
  /* ------------------------------------------------------------------ */
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
  /* UPDATE VIEWPORT FOR ALL VIEWERS - BRIGHTNESS & CONTRAST */
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
        const currentViewport = cornerstone.getViewport(element) || {};
        currentViewport.voi = currentViewport.voi || {};
        currentViewport.voi.windowCenter = windowCenter;
        currentViewport.voi.windowWidth = windowWidth;

        cornerstone.setViewport(element, currentViewport);
        cornerstone.updateImage(element);
      } catch (err) {
        console.error(`Failed to update viewport for viewer ${i}:`, err);
      }
    }
  }, [sliderBrightness, sliderContrast, isImageLoaded, layout, viewerRef, viewerRefs]);

  /* ------------------------------------------------------------------ */
  /* RESET */
  /* ------------------------------------------------------------------ */
  const handleReset = () => {
    if (!viewerRef?.current) return;
    try {
      const viewerCount = getViewerCount(layout);
      for (let i = 0; i < viewerCount; i++) {
        const element = i === 0 ? viewerRef.current : viewerRefs?.current?.[i]?.current;
        if (element) {
          cornerstone.reset(element);
        }
      }
      // Reset to default: windowCenter = 0 → slider 100
      setSliderBrightness(100);
      setSliderContrast(400);
      AnalyticsTracker.trackToolUsage('Reset');
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  /* ------------------------------------------------------------------ */
  /* OPEN BRIGHTNESS/CONTRAST DIALOG */
  /* ------------------------------------------------------------------ */
  const handleOpenBCDialog = () => {
    setOpenBCDialog(true);
    AnalyticsTracker.trackToolUsage('BrightnessContrast');

    const element = viewerRef?.current;
    if (element && isImageLoaded) {
      try {
        const viewport = cornerstone.getViewport(element);
        if (viewport?.voi) {
          const center = viewport.voi.windowCenter ?? 0;
          const width = viewport.voi.windowWidth ?? 400;
          setSliderBrightness(getSliderBrightness(center));
          setSliderContrast(Math.max(1, Math.min(2000, Math.round(width))));
        }
      } catch (err) {
        console.warn("Failed to read initial viewport:", err);
      }
    }
  };

  const handleCloseBCDialog = () => {
    setOpenBCDialog(false);
  };

  /* ------------------------------------------------------------------ */
  /* SEGMENTATION TOGGLE */
  /* ------------------------------------------------------------------ */
  const handleSegmentationToggle = () => {
    const willBeActive = !showSegmentation;
    setShowSegmentation(willBeActive);
    if (willBeActive) {
      handleToolChangeWithTracking('Segmentation');
    } else {
      handleToolChangeWithTracking('Pan');
    }
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
  /* EXPORT (PNG / JPG / DICOM) */
  /* ------------------------------------------------------------------ */
  const handleExportFormat = async (format) => {
    if (!files?.length) {
      alert("No files to export!");
      return;
    }
    const element = viewerRef?.current;
    if (!element) {
      alert("No active viewer!");
      return;
    }
    const zip = new JSZip();
    const exportedFiles = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      try {
        if (format === "dicom") {
          const buffer = await file.arrayBuffer();
          const fileName = file.name || `dicom_${i}.dcm`;
          zip.file(fileName, buffer);
          exportedFiles.push(fileName);
        } else {
          const startTime = Date.now();
          const imageId = `dicomweb:${URL.createObjectURL(file)}`;
          const image = await cornerstone.loadAndCacheImage(imageId);
          cornerstone.displayImage(element, image);
          trackImageLoadTime(startTime);
          const canvas = element.querySelector("canvas");
          if (!canvas) continue;
          let fileData, fileName;
          if (format === "png") {
            fileData = canvas.toDataURL("-le/image/png").split(",")[1];
            fileName = file.name.replace(/\.[^/.]+$/, "") + ".png";
          } else {
            fileData = canvas.toDataURL("image/jpeg").split(",")[1];
            fileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
          }
          zip.file(fileName, fileData, { base64: true });
          exportedFiles.push(fileName);
        }
      } catch (err) {
        console.warn("Export error:", err);
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
        const canvas = element.querySelector("canvas");
        const mime = format === "png" ? "image/png" : "image/jpeg";
        canvas.toBlob(blob => saveAs(blob, exportedFiles[0]), mime);
      }
    } else {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `exported_series_${new Date().toISOString()}.zip`);
    }
  };

  /* ------------------------------------------------------------------ */
  /* MEASUREMENT TOGGLE */
  /* ------------------------------------------------------------------ */
  const handleMeasurementToggle = () => {
    const newState = !isMeasuring;
    setIsMeasuring(newState);
    setShowMeasurement(newState);
    if (newState) {
      handleToolChangeWithTracking('Measure');
      AnalyticsTracker.trackToolUsage('Measurement');
    } else {
      handleToolChangeWithTracking('Pan');
      const viewerCount = getViewerCount(layout);
      for (let i = 0; i < viewerCount; i++) {
        const element = i === 0 ? viewerRef.current : viewerRefs?.current?.[i]?.current;
        if (element) {
          try {
            cornerstoneTools.clearToolState(element, "Length");
            cornerstoneTools.clearToolState(element, "Angle");
            cornerstoneTools.clearToolState(element, "RectangleRoi");
            cornerstone.updateImage(element);
          } catch (err) {
            console.error("Failed to clear measurement:", err);
          }
        }
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /* CINE PLAYER */
  /* ------------------------------------------------------------------ */
  const handleCineToggle = () => {
    setIsPlaying(prev => !prev);
    AnalyticsTracker.trackToolUsage('Cine');
  };

  /* ------------------------------------------------------------------ */
  /* LAYOUT CHANGE */
  /* ------------------------------------------------------------------ */
  const handleLayoutChange = (layout) => {
    onLayoutChange(layout);
    AnalyticsTracker.trackToolUsage(`Layout-${layout}`);
  };

  return (
    <>
      <div className="toolbar-container">
        {/* FIRST ROW */}
        <ButtonGroup variant="contained" className="toolbar-button-group">
          {/* MPR MENU */}
          <Button
            onClick={(e) => setMprAnchorEl(e.currentTarget)}
            disabled={isPlaying || !isImageLoaded}
            className="mpr-button"
            startIcon={<FormatListNumberedIcon />}
            style={{ background: mprMode ? '#4caf50' : '#1a237e', color: 'white' }}
          >
            MPR
          </Button>
          {/* WINDOW-LEVEL */}
          <WindowLevelControls
            viewerRef={viewerRef}
            disabled={isPlaying}
            onActivate={() => AnalyticsTracker.trackToolUsage('Wwwc')}
          />
          {/* PAN */}
          <PanControls
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChangeWithTracking}
            disabled={isPlaying}
            startIcon={<PanToolIcon />}
          />
          {/* ZOOM */}
          <ZoomControls
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChangeWithTracking}
            disabled={isPlaying}
            startIcon={<ZoomInIcon />}
          />
          {/* ROTATE */}
          <RotateMenu
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChangeWithTracking}
            disabled={isPlaying}
            startIcon={<RotateRightIcon />}
          />
          {/* MAGNIFIER */}
          <Magnifier viewerRef={viewerRef} isActive={isMagnifierActive} disabled={isPlaying} />
          <Button
            variant="contained"
            onClick={() => {
              setIsMagnifierActive(prev => !prev);
              AnalyticsTracker.trackToolUsage('Magnify');
            }}
            disabled={isPlaying}
            className="magnifier-button"
            startIcon={<SearchIcon />}
            style={{
              background: isMagnifierActive ? '#4caf50' : '#1a237e',
              color: 'white',
            }}
          >
            Magnifier
          </Button>
          {/* MEASUREMENT */}
          <Button
            variant="contained"
            onClick={handleMeasurementToggle}
            disabled={isPlaying}
            className="measure-button"
            startIcon={<StraightenIcon />}
            style={{
              background: isMeasuring ? '#4caf50' : '#1a237e',
              color: 'white',
            }}
          >
            Measure
          </Button>
          {/* SEGMENTATION */}
          <Button
            variant="contained"
            onClick={handleSegmentationToggle}
            disabled={isPlaying}
            className="segmentation-button"
            startIcon={<BrushIcon />}
            style={{
              background: showSegmentation ? '#4caf50' : '#1a237e',
              color: 'white',
            }}
          >
            Segmentation
          </Button>
          {/* BRIGHTNESS/CONTRAST */}
          <Button
            variant="contained"
            onClick={handleOpenBCDialog}
            disabled={isPlaying || !isImageLoaded}
            className="bc-button"
            startIcon={<Brightness6Icon />}
            style={{
              background: openBCDialog ? '#4caf50' : '#1a237e',
              color: 'white',
            }}
          >
            B/C
          </Button>
          {/* RESET */}
          <Button
            onClick={handleReset}
            disabled={isPlaying}
            className="reset-button"
            startIcon={<RestartAltIcon />}
          >
            Reset
          </Button>
          {/* EXPORT MENU */}
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

        {/* SECOND ROW */}
        {/* <ButtonGroup variant="contained" className="toolbar-button-group toolbar-button-group-row2">
        </ButtonGroup> */}

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
          <MenuItem onClick={() => handleMPRModeSelect(null)} disabled={isPlaying || !mprMode}>
            <span style={{ marginRight: 8 }}>Close MPR</span>
          </MenuItem>
        </Menu>

        {/* EXPORT MENU */}
        <Menu
          anchorEl={exportAnchorEl}
          open={openExportMenu}
          onClose={() => setExportAnchorEl(null)}
          className="export-menu"
        >
          <MenuItem onClick={() => handleExportFormat("png")} disabled={isPlaying}>PNG</MenuItem>
          <MenuItem onClick={() => handleExportFormat("jpg")} disabled={isPlaying}>JPG</MenuItem>
          <MenuItem onClick={() => handleExportFormat("dicom")} disabled={isPlaying}>DICOM</MenuItem>
        </Menu>
      </div>

      {/* MEASUREMENT PANEL */}
      {showMeasurement && (
        <div className="measurement-container">
          <Measurement
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            isMeasurementActive={isMeasuring}
            disabled={isPlaying}
          />
        </div>
      )}

      {/* SEGMENTATION PANEL */}
      {showSegmentation && (
        <Segmentation
          viewerRef={viewerRef}
          isElementEnabled={isElementEnabled}
          isImageLoaded={isImageLoaded}
          isSegmentationActive={activeTool === "Segmentation"}
          disabled={isPlaying}
          onClose={() => setShowSegmentation(false)}
        />
      )}

      {/* BRIGHTNESS/CONTRAST DIALOG */}
      <Dialog 
        open={openBCDialog} 
        onClose={handleCloseBCDialog} 
        maxWidth="xs" 
        fullWidth
        className="bc-dialog"
      >
        <DialogTitle sx={{ position: 'relative' }}>
          Brightness & Contrast
          <Button 
            onClick={() => {
              setSliderBrightness(100);
              setSliderContrast(400);
            }} 
            size="small" 
            sx={{ 
              position: 'absolute',
              right: 8,
              top: 8,
              fontFamily: 'LemonMilk, sans-serif',
              fontSize: '12px',
              textTransform: 'none',
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              color: '#fff',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.25)'
              }
            }}
          >
            Reset
          </Button>
        </DialogTitle>
        <DialogContent>
          <div className="brightness-contrast-container" style={{ padding: '16px' }}>
            {/* Brightness */}
            <Typography sx={{ color: "#020079", fontWeight: "bold", mb: 1 }}>
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
                color: "#020079",
                "& .MuiSlider-rail": { backgroundColor: "#f5f7fa" },
                "& .MuiSlider-track": { backgroundColor: "#003366" },
                "& .MuiSlider-thumb": { backgroundColor: "#020079" },
              }}
            />

            {/* Contrast */}
            <Typography sx={{ color: "#020079", fontWeight: "bold", mb: 1, mt: 3 }}>
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
                color: "#020079",
                "& .MuiSlider-rail": { backgroundColor: "#f5f7fa" },
                "& .MuiSlider-track": { backgroundColor: "#003366" },
                "& .MuiSlider-thumb": { backgroundColor: "#020079" },
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Toolbar;