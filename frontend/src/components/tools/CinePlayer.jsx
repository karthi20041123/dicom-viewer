import React, { useState, useRef, useEffect } from "react";
import { Button, Slider, Popover, Box } from "@mui/material";
import * as cornerstone from "cornerstone-core";

const CinePlayer = ({ viewerRef, files }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(500); // ms per frame
  const frameIndex = useRef(0);
  const intervalRef = useRef(null);
  const [anchorEl, setAnchorEl] = useState(null);

  const playSeries = () => {
    if (!files?.length || !viewerRef?.current) return;

    intervalRef.current = setInterval(async () => {
      try {
        const file = files[frameIndex.current];
        if (!file) return;

        const imageId = `dicomweb:${URL.createObjectURL(file)}`;
        const image = await cornerstone.loadAndCacheImage(imageId);

        cornerstone.displayImage(viewerRef.current, image);
        frameIndex.current = (frameIndex.current + 1) % files.length; // loop
      } catch (err) {
        console.error("Playback error:", err);
      }
    }, speed);
  };

  const stopSeries = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  useEffect(() => {
    if (isPlaying) playSeries();
    else stopSeries();
    return stopSeries;
  }, [isPlaying, speed]);

  // ✅ Open popup & start playback on button click
  const handleButtonClick = (event) => {
    setAnchorEl(event.currentTarget);
    setIsPlaying(true); // auto-play when popup opens
  };

  const handleClose = () => {
    setAnchorEl(null);
    setIsPlaying(false); // stop playback when popup closes
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <Button variant="contained" onClick={handleButtonClick}>
        Cine {isPlaying ? "ON" : ""}
      </Button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Box
          sx={{
            p: 2,
            bgcolor: "#1e1e1e",
            color: "white",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            width: "250px",
            borderRadius: "8px",
          }}
        >
          <Slider
            value={speed}
            onChange={(e, val) => setSpeed(val)}
            min={100}
            max={1000}
            step={50}
          />
          <span>{(1000 / speed).toFixed(1)} fps</span>
        </Box>
      </Popover>
    </>
  );
};

export default CinePlayer;
