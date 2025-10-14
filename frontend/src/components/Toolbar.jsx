import React, { useState } from "react";
import {
  Button,
  ButtonGroup,
  Menu,
  MenuItem,
} from "@mui/material";
import * as cornerstone from "cornerstone-core";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import PanControls from "./tools/PanControls";
import ZoomControls from "./tools/ZoomControls";
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

const Toolbar = ({
  activeTool,
  handleToolChange,
  viewerRef,
  files,
  isElementEnabled,
  isImageLoaded,
  isPlaying,
  setIsPlaying,
  currentLayout,
  onLayoutChange,
  mprMode,
  setMprMode,
}) => {
  const [showMeasurement, setShowMeasurement] = useState(false);
  const [showSegmentation, setShowSegmentation] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [exportAnchorEl, setExportAnchorEl] = useState(null);
  const [mprAnchorEl, setMprAnchorEl] = useState(null);
  const openExportMenu = Boolean(exportAnchorEl);
  const openMprMenu = Boolean(mprAnchorEl);
  const [isMagnifierActive, setIsMagnifierActive] = useState(false);

  const handleReset = () => {
    if (!viewerRef?.current) return;
    try {
      cornerstone.reset(viewerRef.current);
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  const handleSegmentationToggle = () => {
    setShowSegmentation((prev) => !prev);
    if (showSegmentation) {
      if (activeTool === "Segmentation") {
        handleToolChange("Pan");
      }
    } else {
      handleToolChange("Segmentation");
    }
  };

  const handleMPRModeSelect = (mode) => {
    setMprMode(mode);
    setMprAnchorEl(null);
  };

  const handleShareToggle = () => {
    setShowShareDialog((prev) => !prev);
  };

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
    let exportedFiles = [];

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
          const imageId = `dicomweb:${URL.createObjectURL(file)}`;
          const image = await cornerstone.loadAndCacheImage(imageId);
          cornerstone.displayImage(element, image);

          const canvas = element.querySelector("canvas");
          if (!canvas) continue;

          let fileData, fileName;
          if (format === "png") {
            fileData = canvas.toDataURL("image/png").split(",")[1];
            fileName = file.name.replace(/\.[^/.]+$/, "") + ".png";
          } else if (format === "jpg") {
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

    if (exportedFiles.length === 0) {
      alert("No files were exported!");
      return;
    }

    if (files.length === 1) {
      if (format === "dicom") {
        saveAs(
          new Blob([await files[0].arrayBuffer()]),
          files[0].name || "image.dcm"
        );
      } else {
        const canvas = element.querySelector("canvas");
        const mimeType = format === "png" ? "image/png" : "image/jpeg";
        canvas.toBlob((blob) => {
          saveAs(blob, exportedFiles[0]);
        }, mimeType);
      }
    } else {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `exported_series_${new Date().toISOString()}.zip`);
    }
  };

  return (
    <>
      <div className="toolbar-container">
        <ButtonGroup
          variant="contained"
          className="toolbar-button-group"
        >
          <Button
            onClick={(e) => setMprAnchorEl(e.currentTarget)}
            disabled={isPlaying || !isImageLoaded}
            className="mpr-button"
            startIcon={<FormatListNumberedIcon />}
            style={{
              background: mprMode ? '#4caf50' : '#1a237e',
              color: 'white',
            }}
          >
            MPR
          </Button>

          <WindowLevelControls viewerRef={viewerRef} disabled={isPlaying} />
          <PanControls
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChange}
            disabled={isPlaying}
            startIcon={<PanToolIcon />}
          />
          <ZoomControls
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChange}
            disabled={isPlaying}
            startIcon={<ZoomInIcon />}
          />
          <RotateMenu
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChange}
            disabled={isPlaying}
            startIcon={<RotateRightIcon />}
          />
          <Magnifier viewerRef={viewerRef} isActive={isMagnifierActive} disabled={isPlaying} />
          <Button
            variant="contained"
            onClick={() => setIsMagnifierActive((prev) => !prev)}
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
          <Button
            variant="contained"
            onClick={handleShareToggle}
            disabled={isPlaying || !isImageLoaded}
            className="share-button"
            startIcon={<ShareIcon />}
            style={{
              background: showShareDialog ? '#4caf50' : '#1a237e',
              color: 'white',
            }}
          >
            Share Study
          </Button>
          <CinePlayer
            viewerRef={viewerRef}
            files={files}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            startIcon={<PlayArrowIcon />}
          />
          <PanelControls 
            onLayoutChange={onLayoutChange} 
            currentLayout={currentLayout}
            startIcon={<ViewModuleIcon />}
          />
          <LayoutControls 
            onLayoutChange={onLayoutChange} 
            currentLayout={currentLayout}
            startIcon={<ViewModuleIcon />}
          />
        </ButtonGroup>

        <Menu
          anchorEl={mprAnchorEl}
          open={openMprMenu}
          onClose={() => setMprAnchorEl(null)}
          disabled={isPlaying}
          className="mpr-menu"
        >
          <MenuItem onClick={() => handleMPRModeSelect("orthogonal")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>📐</span>
            Orthogonal
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + M</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("axial")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>🔄</span>
            Axial
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + A</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("coronal")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>📏</span>
            Coronal
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + C</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("sagittal")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>📐</span>
            Sagittal
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + S</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("mist_oblique")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>🌟</span>
            MIST Oblique
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + Q</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect(null)} disabled={isPlaying || !mprMode}>
            <span style={{ marginRight: 8 }}>❌</span>
            Close MPR
          </MenuItem>
        </Menu>

        <Menu
          anchorEl={exportAnchorEl}
          open={openExportMenu}
          onClose={() => setExportAnchorEl(null)}
          disabled={isPlaying}
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

      {showShareDialog && (
        <SharedView
          viewerRef={viewerRef}
          files={files}
          isImageLoaded={isImageLoaded}
          onClose={() => setShowShareDialog(false)}
          disabled={isPlaying}
        />
      )}

      {showMeasurement && (
        <div className="measurement-container">
          <Measurement
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            isMeasurementActive={activeTool === "Measure"}
            disabled={isPlaying}
          />
        </div>
      )}

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
    </>
  );
};

export default Toolbar;