import React from "react";
import { Button, Menu, MenuItem, Typography, Divider } from "@mui/material";
import * as cornerstone from "cornerstone-core";


const presets = [
  { label: "Auto", windowWidth: 1294, windowCenter: 647 },
  { label: "DICOM Default", windowWidth: 1294, windowCenter: 647 },
  { label: "Lung", windowWidth: 1500, windowCenter: -600 },
  { label: "Brain", windowWidth: 80, windowCenter: 40 },
];

const WindowLevelControls = ({ viewerRef }) => {
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const applyWindowLevel = (ww, wc) => {
    const element = viewerRef?.current;
    if (!element) return;

    const viewport = cornerstone.getViewport(element);
    viewport.voi.windowWidth = ww;
    viewport.voi.windowCenter = wc;
    cornerstone.setViewport(element, viewport);
  };

  const invertImage = () => {
    const element = viewerRef?.current;
    if (!element) return;

    const viewport = cornerstone.getViewport(element);
    viewport.invert = !viewport.invert;
    cornerstone.setViewport(element, viewport);
  };

  return (
    <>
      <Button 
        variant="outlined"
        onClick={handleOpen}
        sx={{
          color: "#001f3f", // Navy blue text
          borderColor: "#001f3f", // Navy blue border
          "&:hover": {
            borderColor: "#003366", // Lighter navy blue on hover
            backgroundColor: "#f5f7fa", // Light gray-blue background on hover
          },
          fontFamily: "LemonMilk, sans-serif",
          textTransform: "none",
          borderRadius: "8px",
        }}
      >
        Window
        /Level
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        sx={{
          "& .MuiPaper-root": {
            backgroundColor: "#ffffff", // White background for menu
            color: "#001f3f", // Navy blue text
            boxShadow: "0 2px 4px rgba(0, 31, 63, 0.2)", // Navy blue shadow
            borderRadius: "8px",
          },
        }}
      >
        <Typography
          sx={{
            px: 2,
            py: 1,
            fontWeight: "bold",
            backgroundColor: "#001f3f", // Light gray-blue for title background
            color: "#ffffffff", // Navy blue text
            borderTopLeftRadius: "8px",
            borderTopRightRadius: "8px",
          }}
        >
          DICOM Windowing
        </Typography>
        {presets.map((preset) => (
          <MenuItem
            key={preset.label}
            onClick={() => {
              applyWindowLevel(preset.windowWidth, preset.windowCenter);
              handleClose();
            }}
            sx={{
              color: "#001f3f", // Navy blue text
              backgroundColor: "#ffffff",
              "&:hover": {
                backgroundColor: "#f5f7fa", // Light gray-blue on hover
              },
            }}
          >
            {preset.label} w: {preset.windowWidth} l: {preset.windowCenter}
          </MenuItem>
        ))}
        <Divider sx={{ backgroundColor: "#e0e0e0" }} /> {/* Light gray divider */}
        <MenuItem
          onClick={() => {
            invertImage();
            handleClose();
          }}
          sx={{
            color: "#001f3f", // Navy blue text
            backgroundColor: "#ffffff",
            "&:hover": {
              backgroundColor: "#f5f7fa", // Light gray-blue on hover
            },
          }}
        >
          Invert
        </MenuItem>
        <MenuItem
          disabled
          sx={{
            color: "#4a5e7a", // Lighter navy for disabled items
          }}
        >
          Show DICOM Overlay
        </MenuItem>
        <MenuItem
          disabled
          sx={{
            color: "#4a5e7a", // Lighter navy for disabled items
          }}
        >
          Sync Windowing for Same Series
        </MenuItem>
        <MenuItem
          disabled
          sx={{
            color: "#4a5e7a", // Lighter navy for disabled items
          }}
        >
          Color Palette Selection
        </MenuItem>
        <MenuItem
          disabled
          sx={{
            color: "#4a5e7a", // Lighter navy for disabled items
          }}
        >
          Histogram
        </MenuItem>
      </Menu>
    </>
  );
};

export default WindowLevelControls;