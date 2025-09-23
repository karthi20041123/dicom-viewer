// MultiplanarReconstruction.jsx
import React, { useState, useEffect, useRef } from "react";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneTools from "cornerstone-tools";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import * as dicomParser from "dicom-parser";
import { Rotate90DegreesCcw, ZoomIn, ZoomOut } from "@mui/icons-material";
import { Button, Typography, Box, Slider, Paper, IconButton } from "@mui/material";
import "../styles/MPR.css";

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

const MultiplanarReconstruction = ({
  files,
  isImageLoaded,
  onClose,
  disabled = false,
  currentIndex,
  brightness,
  contrast,
}) => {
  const [currentSlices, setCurrentSlices] = useState({ axial: 0, coronal: 0, sagittal: 0 });
  const [volumeData, setVolumeData] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [rotation, setRotation] = useState({ axial: 0, coronal: 0, sagittal: 0 });
  const [zoom, setZoom] = useState({ axial: 1, coronal: 1, sagittal: 1 });

  const axialRef = useRef(null);
  const coronalRef = useRef(null);
  const sagittalRef = useRef(null);

  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
  const isEnabled = (el) => {
    try {
      return !!cornerstone.getEnabledElement(el);
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!isImageLoaded || !files?.length || disabled) return;

    const initializeMPRViewers = async () => {
      try {
        const imageIds = files.map((file) => `wadouri:${URL.createObjectURL(file)}`);
        [axialRef, coronalRef, sagittalRef].forEach((ref) => {
          if (ref.current) {
            cornerstone.enable(ref.current);
            cornerstoneTools.addStackStateManager(ref.current, ["stack"]);
            const stack = { currentImageIdIndex: currentIndex || 0, imageIds };
            cornerstoneTools.addToolState(ref.current, "stack", stack);
          }
        });

        cornerstoneTools.init();
        cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
        cornerstoneTools.addTool(cornerstoneTools.PanTool);
        cornerstoneTools.addTool(cornerstoneTools.RotateTool);
        cornerstoneTools.setToolActive("Zoom", { mouseButtonMask: 1 });
        cornerstoneTools.setToolActive("Pan", { mouseButtonMask: 2 });

        await loadVolumeData(imageIds);
        setIsInitialized(true);
      } catch (err) {
        console.error("MPR initialization failed:", err);
      }
    };

    initializeMPRViewers();

    return () => {
      [axialRef, coronalRef, sagittalRef].forEach((ref) => {
        if (ref.current) {
          try {
            if (isEnabled(ref.current)) cornerstone.disable(ref.current);
          } catch {}
        }
      });
    };
  }, [isImageLoaded, files, disabled, currentIndex]);

  const loadVolumeData = async (imageIdsFromInit) => {
    if (!files?.length) return;

    try {
      const imageIds = imageIdsFromInit ?? files.map((f) => `wadouri:${URL.createObjectURL(f)}`);
      const images = await Promise.all(imageIds.map((id) => cornerstone.loadAndCacheImage(id)));

      if (!images?.length) throw new Error("No images loaded");

      const first = images[0];
      const dimensions = {
        width: first.width,
        height: first.height,
        depth: images.length,
      };

      setVolumeData({ images, dimensions });
      setCurrentSlices({
        axial: clamp(currentIndex ?? Math.floor(dimensions.depth / 2), 0, dimensions.depth - 1),
        coronal: Math.floor(dimensions.height / 2),
        sagittal: Math.floor(dimensions.width / 2),
      });
    } catch (err) {
      console.error("Volume loading failed:", err);
    }
  };

  const makeImageLike = (base, { width, height, pixelData }) => {
    const min = pixelData?.length ? Math.min(...pixelData) : 0;
    const max = pixelData?.length ? Math.max(...pixelData) : 0;
    return {
      ...base,
      getPixelData: () => pixelData,
      rows: height,
      columns: width,
      width,
      height,
      sizeInBytes: pixelData?.byteLength ?? width * height * 2,
      minPixelValue: min,
      maxPixelValue: max,
    };
  };

  const reconstructSlice = (plane, sliceIndex) => {
    if (!volumeData) return null;
    const { images, dimensions } = volumeData;
    const width = dimensions.width;
    const height = dimensions.height;
    const depth = dimensions.depth;

    if (plane === "coronal") {
      const y = clamp(sliceIndex, 0, height - 1);
      const pixelData = new Uint16Array(width * depth);
      for (let z = 0; z < depth; z++) {
        const src = images[z].getPixelData();
        for (let x = 0; x < width; x++) {
          pixelData[z * width + x] = src[y * width + x];
        }
      }
      return makeImageLike(images[0], { width, height: depth, pixelData });
    }

    if (plane === "sagittal") {
      const x = clamp(sliceIndex, 0, width - 1);
      const pixelData = new Uint16Array(height * depth);
      for (let z = 0; z < depth; z++) {
        const src = images[z].getPixelData();
        for (let y = 0; y < height; y++) {
          pixelData[z * height + y] = src[y * width + x];
        }
      }
      return makeImageLike(images[0], { width: height, height: depth, pixelData });
    }

    return null;
  };

  const displayMPRSlices = (volume) => {
    if (!volume || !isInitialized) return;
    try {
      const imageIds = files.map((file) => `wadouri:${URL.createObjectURL(file)}`);

      // Axial
      if (axialRef.current && isEnabled(axialRef.current)) {
        const idx = clamp(currentSlices.axial, 0, volume.images.length - 1);
        const stack = { currentImageIdIndex: idx, imageIds };
        cornerstoneTools.addToolState(axialRef.current, "stack", stack);
        cornerstone.displayImage(axialRef.current, volume.images[idx]);
      }

      // Coronal
      if (coronalRef.current && isEnabled(coronalRef.current)) {
        const coronalImage = reconstructSlice("coronal", currentSlices.coronal);
        if (coronalImage) {
          const stack = { currentImageIdIndex: currentSlices.coronal, imageIds };
          cornerstoneTools.addToolState(coronalRef.current, "stack", stack);
          cornerstone.displayImage(coronalRef.current, coronalImage);
        }
      }

      // Sagittal
      if (sagittalRef.current && isEnabled(sagittalRef.current)) {
        const sagittalImage = reconstructSlice("sagittal", currentSlices.sagittal);
        if (sagittalImage) {
          const stack = { currentImageIdIndex: currentSlices.sagittal, imageIds };
          cornerstoneTools.addToolState(sagittalRef.current, "stack", stack);
          cornerstone.displayImage(sagittalRef.current, sagittalImage);
        }
      }

      [axialRef, coronalRef, sagittalRef].forEach((ref, index) => {
        if (ref.current && isEnabled(ref.current)) {
          const planeKey = ["axial", "coronal", "sagittal"][index];
          const viewport = cornerstone.getViewport(ref.current) || {};
          viewport.voi = viewport.voi || { windowCenter: 40, windowWidth: 400 };
          viewport.voi.windowCenter = brightness ?? viewport.voi.windowCenter;
          viewport.voi.windowWidth = contrast ?? viewport.voi.windowWidth;
          viewport.scale = zoom[planeKey];
          viewport.rotation = rotation[planeKey];
          cornerstone.setViewport(ref.current, viewport);
        }
      });
    } catch (err) {
      console.error("MPR slice display failed:", err);
    }
  };

  useEffect(() => {
    if (volumeData && isInitialized) displayMPRSlices(volumeData);
  }, [currentSlices, volumeData, isInitialized, rotation, zoom, brightness, contrast]);

  const handleSliceChange = (plane, value) => setCurrentSlices((prev) => ({ ...prev, [plane]: value }));
  const handleRotate = (plane) => setRotation((prev) => ({ ...prev, [plane]: (prev[plane] + 90) % 360 }));
  const handleZoom = (plane, factor) => setZoom((prev) => ({ ...prev, [plane]: clamp(prev[plane] * factor, 0.1, 5) }));

  const renderPlane = (plane, ref, max) => (
    <Paper className="mpr-viewer-container">
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2">{plane.charAt(0).toUpperCase() + plane.slice(1)}</Typography>
        <Box>
          <IconButton onClick={() => handleRotate(plane)}><Rotate90DegreesCcw /></IconButton>
          <IconButton onClick={() => handleZoom(plane, 1.2)}><ZoomIn /></IconButton>
          <IconButton onClick={() => handleZoom(plane, 0.8)}><ZoomOut /></IconButton>
        </Box>
      </Box>
      <div ref={ref} className={`mpr-viewer ${plane}-viewer`} style={{ width: "100%", height: "200px" }} />
      <Slider
        value={currentSlices[plane]}
        min={0}
        max={max}
        step={1}
        onChange={(e, value) => handleSliceChange(plane, value)}
        disabled={disabled}
      />
      <Typography variant="caption">Slice: {currentSlices[plane] + 1} / {max + 1}</Typography>
    </Paper>
  );

  if (!isImageLoaded || disabled) {
    return (
      <Paper className="mpr-disabled-container">
        <Typography>MPR is not available. Please load a DICOM series first.</Typography>
      </Paper>
    );
  }

  return (
    <Paper className="mpr-main-container" sx={{ bgcolor: "#f5f5f5", p: 2 }}>
      <Box className="mpr-header" sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h5">Multiplanar Reconstruction (MPR)</Typography>
        <Button variant="outlined" onClick={onClose}>Close MPR</Button>
      </Box>
      <Box className="mpr-viewers-grid">
        {renderPlane("axial", axialRef, (volumeData?.dimensions?.depth || 1) - 1)}
        {renderPlane("coronal", coronalRef, (volumeData?.dimensions?.height || 1) - 1)}
        {renderPlane("sagittal", sagittalRef, (volumeData?.dimensions?.width || 1) - 1)}
      </Box>
      {volumeData && (
        <Box className="mpr-info" sx={{ mt: 2 }}>
          <Typography variant="caption">
            Volume: {volumeData.dimensions.width} × {volumeData.dimensions.height} × {volumeData.dimensions.depth} voxels
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default MultiplanarReconstruction;