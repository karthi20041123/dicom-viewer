import React, { useState, useEffect, useRef } from "react";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneTools from "cornerstone-tools";
import * as cornerstoneMath from "cornerstone-math";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import { Button, Slider, Typography, Box } from "@mui/material";

const MPRViewer = ({ files, isMPREnabled, onClose }) => {
  const [volume, setVolume] = useState(null);
  const [axialIndex, setAxialIndex] = useState(0);
  const [sagittalIndex, setSagittalIndex] = useState(0);
  const [coronalIndex, setCoronalIndex] = useState(0);
  const axialRef = useRef(null);
  const sagittalRef = useRef(null);
  const coronalRef = useRef(null);

  useEffect(() => {
    if (!files || files.length < 2) {
      console.warn("MPR requires at least 2 images");
      return;
    }

    // Configure cornerstone WADO image loader
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
    cornerstoneWADOImageLoader.external.cornerstoneMath = cornerstoneMath;

    const initCornerstone = async () => {
      try {
        // Create image IDs from files
        const imageIds = files.map((file) =>
          `wadouri:${URL.createObjectURL(file)}`
        );

        // Load all images
        const loadedImages = await Promise.all(
          imageIds.map((imageId) => cornerstone.loadImage(imageId))
        );

        console.log(`Loaded ${loadedImages.length} images for MPR`);

        // Create volume data
        const firstImage = loadedImages[0];
        const width = firstImage.width;
        const height = firstImage.height;
        const depth = loadedImages.length;

        // Combine all pixel data
        const totalPixels = width * height * depth;
        const volumePixelData = new Float32Array(totalPixels);

        for (let z = 0; z < depth; z++) {
          const pixelData = loadedImages[z].getPixelData();
          const offset = z * width * height;
          volumePixelData.set(pixelData, offset);
        }

        const volumeData = {
          scalarData: volumePixelData,
          dimensions: [width, height, depth],
          spacing: [1, 1, 1], // You might want to extract real spacing from DICOM
          origin: [0, 0, 0],
          windowWidth: firstImage.windowWidth || 400,
          windowCenter: firstImage.windowCenter || 200,
        };

        setVolume(volumeData);

        // Initialize indices
        setAxialIndex(Math.floor(depth / 2));
        setSagittalIndex(Math.floor(width / 2));
        setCoronalIndex(Math.floor(height / 2));

        // Enable cornerstone elements
        [axialRef, sagittalRef, coronalRef].forEach((ref) => {
          if (ref.current) {
            try {
              cornerstone.enable(ref.current);
            } catch (err) {
              // Element might already be enabled
              console.warn("Element already enabled:", err);
            }
          }
        });

      } catch (error) {
        console.error("MPR initialization failed:", error);
        alert("Failed to initialize MPR viewer. Please try again.");
      }
    };

    if (isMPREnabled) {
      initCornerstone();
    }

    // Cleanup function
    return () => {
      [axialRef, sagittalRef, coronalRef].forEach((ref) => {
        if (ref.current) {
          try {
            cornerstone.disable(ref.current);
          } catch (err) {
            console.warn("Error disabling element:", err);
          }
        }
      });
    };
  }, [files, isMPREnabled]);

  const createMPRImage = React.useCallback((volume, sliceIndex, plane) => {
    const { dimensions, scalarData, windowWidth, windowCenter } = volume;
    const [width, height, depth] = dimensions;

    let sliceData, imageWidth, imageHeight;

    if (plane === "axial") {
      imageWidth = width;
      imageHeight = height;
      sliceData = new Uint16Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const volumeIndex = sliceIndex * width * height + y * width + x;
          sliceData[y * width + x] = scalarData[volumeIndex];
        }
      }
    } else if (plane === "sagittal") {
      imageWidth = depth;
      imageHeight = height;
      sliceData = new Uint16Array(depth * height);
      for (let y = 0; y < height; y++) {
        for (let z = 0; z < depth; z++) {
          const volumeIndex = z * width * height + y * width + sliceIndex;
          sliceData[y * depth + z] = scalarData[volumeIndex];
        }
      }
    } else if (plane === "coronal") {
      imageWidth = width;
      imageHeight = depth;
      sliceData = new Uint16Array(width * depth);
      for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
          const volumeIndex = z * width * height + sliceIndex * width + x;
          sliceData[z * width + x] = scalarData[volumeIndex];
        }
      }
    }

    return {
      getPixelData: () => sliceData,
      width: imageWidth,
      height: imageHeight,
      columnPixelSpacing: 1,
      rowPixelSpacing: 1,
      invert: false,
      windowWidth: windowWidth,
      windowCenter: windowCenter,
      color: false,
      rgba: false,
      minPixelValue: Math.min(...sliceData),
      maxPixelValue: Math.max(...sliceData),
      slope: 1,
      intercept: 0,
    };
  }, []);

  useEffect(() => {
    if (!volume) return;

    const updateDisplay = () => {
      try {
        if (axialRef.current) {
          const axialImage = createMPRImage(volume, axialIndex, "axial");
          cornerstone.displayImage(axialRef.current, axialImage);
        }

        if (sagittalRef.current) {
          const sagittalImage = createMPRImage(volume, sagittalIndex, "sagittal");
          cornerstone.displayImage(sagittalRef.current, sagittalImage);
        }

        if (coronalRef.current) {
          const coronalImage = createMPRImage(volume, coronalIndex, "coronal");
          cornerstone.displayImage(coronalRef.current, coronalImage);
        }
      } catch (error) {
        console.error("Failed to update MPR display:", error);
      }
    };

    updateDisplay();
  }, [volume, axialIndex, sagittalIndex, coronalIndex]);

  if (!isMPREnabled || !volume) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: 20,
          right: 20,
        }}
      >
        <Button
          variant="contained"
          onClick={onClose}
          sx={{
            backgroundColor: "#f44336",
            "&:hover": { backgroundColor: "#d32f2f" },
          }}
        >
          Close MPR
        </Button>
      </Box>

      <Typography variant="h4" sx={{ mb: 3, color: "white" }}>
        Multi-Planar Reconstruction (MPR)
      </Typography>

      <Box
        sx={{
          display: "flex",
          gap: 3,
          justifyContent: "space-around",
          alignItems: "flex-start",
          maxWidth: "1200px",
          width: "100%",
        }}
      >
        {/* Axial View */}
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h6" sx={{ mb: 1, color: "white" }}>
            Axial (Z-axis)
          </Typography>
          <div
            ref={axialRef}
            style={{
              width: "300px",
              height: "300px",
              border: "2px solid #fff",
              backgroundColor: "black",
            }}
          />
          <Box sx={{ width: "300px", mt: 2 }}>
            <Typography variant="body2" sx={{ color: "white", mb: 1 }}>
              Slice: {axialIndex + 1} / {volume.dimensions[2]}
            </Typography>
            <Slider
              value={axialIndex}
              min={0}
              max={volume.dimensions[2] - 1}
              step={1}
              onChange={(e, val) => setAxialIndex(val)}
              sx={{
                color: "#fff",
                "& .MuiSlider-thumb": {
                  backgroundColor: "#fff",
                },
                "& .MuiSlider-track": {
                  backgroundColor: "#fff",
                },
                "& .MuiSlider-rail": {
                  backgroundColor: "#666",
                },
              }}
            />
          </Box>
        </Box>

        {/* Sagittal View */}
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h6" sx={{ mb: 1, color: "white" }}>
            Sagittal (X-axis)
          </Typography>
          <div
            ref={sagittalRef}
            style={{
              width: "300px",
              height: "300px",
              border: "2px solid #fff",
              backgroundColor: "black",
            }}
          />
          <Box sx={{ width: "300px", mt: 2 }}>
            <Typography variant="body2" sx={{ color: "white", mb: 1 }}>
              Slice: {sagittalIndex + 1} / {volume.dimensions[0]}
            </Typography>
            <Slider
              value={sagittalIndex}
              min={0}
              max={volume.dimensions[0] - 1}
              step={1}
              onChange={(e, val) => setSagittalIndex(val)}
              sx={{
                color: "#fff",
                "& .MuiSlider-thumb": {
                  backgroundColor: "#fff",
                },
                "& .MuiSlider-track": {
                  backgroundColor: "#fff",
                },
                "& .MuiSlider-rail": {
                  backgroundColor: "#666",
                },
              }}
            />
          </Box>
        </Box>

        {/* Coronal View */}
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h6" sx={{ mb: 1, color: "white" }}>
            Coronal (Y-axis)
          </Typography>
          <div
            ref={coronalRef}
            style={{
              width: "300px",
              height: "300px",
              border: "2px solid #fff",
              backgroundColor: "black",
            }}
          />
          <Box sx={{ width: "300px", mt: 2 }}>
            <Typography variant="body2" sx={{ color: "white", mb: 1 }}>
              Slice: {coronalIndex + 1} / {volume.dimensions[1]}
            </Typography>
            <Slider
              value={coronalIndex}
              min={0}
              max={volume.dimensions[1] - 1}
              step={1}
              onChange={(e, val) => setCoronalIndex(val)}
              sx={{
                color: "#fff",
                "& .MuiSlider-thumb": {
                  backgroundColor: "#fff",
                },
                "& .MuiSlider-track": {
                  backgroundColor: "#fff",
                },
                "& .MuiSlider-rail": {
                  backgroundColor: "#666",
                },
              }}
            />
          </Box>
        </Box>
      </Box>

      <Typography
        variant="body2"
        sx={{ mt: 3, color: "white", textAlign: "center", opacity: 0.7 }}
      >
        Use sliders to navigate through different slices in each view
      </Typography>
    </Box>
  );
};

export default MPRViewer;