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
import MultiplanarReconstruction from "./tools/MultiplanarReconstruction";
import SharedView from "./tools/SharedView";
import "./styles/Toolbar.css";

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
}) => {
  const [showMeasurement, setShowMeasurement] = useState(false);
  const [showSegmentation, setShowSegmentation] = useState(false);
  const [showMPR, setShowMPR] = useState(false);
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

  const handleMPRToggle = () => {
    setShowMPR((prev) => !prev);
  };

  const handleMPRModeSelect = (mode) => {
    setShowMPR(true);
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
            style={{
              background: showMPR ? '#4caf50' : '#1976d2',
              color: 'white'
            }}
          >
            MPR {showMPR ? "ON" : "OFF"}
          </Button>

          <WindowLevelControls viewerRef={viewerRef} disabled={isPlaying} />
          <PanControls
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChange}
            disabled={isPlaying}
          />
          <ZoomControls
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChange}
            disabled={isPlaying}
          />
          <RotateMenu
            viewerRef={viewerRef}
            isElementEnabled={isElementEnabled}
            isImageLoaded={isImageLoaded}
            activeTool={activeTool}
            handleToolChange={handleToolChange}
            disabled={isPlaying}
          />
          <Magnifier viewerRef={viewerRef} isActive={isMagnifierActive} disabled={isPlaying} />
          <Button
            variant="contained"
            onClick={() => setIsMagnifierActive((prev) => !prev)}
            disabled={isPlaying}
            className="magnifier-button"
          >
            Magnifier {isMagnifierActive ? "ON" : "OFF"}
          </Button>
          <Button
            variant="contained"
            onClick={handleSegmentationToggle}
            disabled={isPlaying}
            className="segmentation-button"
          >
            Segmentation {showSegmentation ? "ON" : "OFF"}
          </Button>
          <Button onClick={handleReset} disabled={isPlaying} className="reset-button">
            Reset
          </Button>
          <Button
            onClick={(e) => setExportAnchorEl(e.currentTarget)}
            disabled={isPlaying}
            className="export-button"
          >
            Export
          </Button>
          <Button
            variant="contained"
            onClick={handleShareToggle}
            disabled={isPlaying || !isImageLoaded}
            className="share-button"
            style={{ background: showShareDialog ? '#4caf50' : '#1976d2', color: 'white' }}
          >
            Share Study
          </Button>
          <CinePlayer
            viewerRef={viewerRef}
            files={files}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
          />
          <PanelControls 
            onLayoutChange={onLayoutChange} 
            currentLayout={currentLayout}
          />
          <LayoutControls 
            onLayoutChange={onLayoutChange} 
            currentLayout={currentLayout}
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
          <MenuItem onClick={() => handleMPRModeSelect("mist_axial")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>⭐</span>
            MIST Axial
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + 1</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("mist_coronal")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>✨</span>
            MIST Coronal
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + O</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("mist_sagittal")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>💫</span>
            MIST Sagittal
            <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#666' }}>Shift + P</span>
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("mist_advanced_pet")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>🔬</span>
            MIST Advanced PET
          </MenuItem>
          <MenuItem onClick={() => handleMPRModeSelect("dental")} disabled={isPlaying}>
            <span style={{ marginRight: 8 }}>🦷</span>
            Dental MPR
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

      {showMPR && (
        <MultiplanarReconstruction
          viewerRef={viewerRef}
          files={files}
          isElementEnabled={isElementEnabled}
          isImageLoaded={isImageLoaded}
          onClose={() => setShowMPR(false)}
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