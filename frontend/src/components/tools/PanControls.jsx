import React, { useState } from "react";
import { Button, Menu, MenuItem, Typography, Divider } from "@mui/material";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneTools from "cornerstone-tools";

const PanControls = ({ viewerRef, isElementEnabled, isImageLoaded, activeTool, handleToolChange }) => {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const activatePan = () => {
    const element = viewerRef?.current;
    if (!element || !isElementEnabled || !isImageLoaded) return;

    handleToolChange("Pan"); // Set Pan as active tool

    try {
      // Disable other tools
      cornerstoneTools.setToolDisabled("Zoom");
      cornerstoneTools.setToolDisabled("Pan");

      // Activate Pan tool with left mouse button
      cornerstoneTools.setToolActive("Pan", { mouseButtonMask: 1 });
    } catch (err) {
      console.error("Error activating Pan tool:", err);
    }

    handleClose();
  };

  const handlePanAction = (action) => {
    const element = viewerRef?.current;
    if (!element) return;

    const viewport = cornerstone.getViewport(element);

    switch (action) {
      case "alignLeft":
        viewport.translation.x -= 20;
        break;
      case "alignRight":
        viewport.translation.x += 20;
        break;
      case "alignCenter":
        viewport.translation.x = 0;
        viewport.translation.y = 0;
        break;
      case "panUp":
        viewport.translation.y -= 20;
        break;
      case "panDown":
        viewport.translation.y += 20;
        break;
      default:
        break;
    }

    cornerstone.setViewport(element, viewport);
    handleClose();
  };

  return (
    <>
      <Button
        className="pan-button"
        onClick={handleOpen}
        sx={{
          backgroundColor: activeTool === "Pan" ? "#001f3f" : "#ffffff", // Navy blue when active, white otherwise
          color: activeTool === "Pan" ? "#ffffff" : "#001f3f", // White text when active, navy blue otherwise
          border: "1px solid #001f3f", // Navy blue border
          fontFamily: "LemonMilk, sans-serif",
          textTransform: "none",
          borderRadius: "8px",
          "&:hover": {
            backgroundColor: activeTool === "Pan" ? "#003366" : "#f5f7fa", // Lighter navy or light gray-blue on hover
            color: activeTool === "Pan" ? "#ffffff" : "#001f3f",
          },
        }}
      >
        Pan
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
          }}
        >
          Pan Options
        </Typography>
        <Divider sx={{ backgroundColor: "#4a5e7a" }} /> {/* Lighter navy for divider */}
        <MenuItem
          onClick={() => handlePanAction("alignLeft")}
          sx={{
            color: "#001f3f", // Navy blue text
            "&:hover": { backgroundColor: "#f5f7fa" }, // Light gray-blue on hover
          }}
        >
          Align Left
        </MenuItem>
        <MenuItem
          onClick={() => handlePanAction("alignRight")}
          sx={{
            color: "#001f3f", // Navy blue text
            "&:hover": { backgroundColor: "#f5f7fa" }, // Light gray-blue on hover
          }}
        >
          Align Right
        </MenuItem>
        <MenuItem
          onClick={() => handlePanAction("alignCenter")}
          sx={{
            color: "#001f3f", // Navy blue text
            "&:hover": { backgroundColor: "#f5f7fa" }, // Light gray-blue on hover
          }}
        >
          Align Center
        </MenuItem>
        <Divider sx={{ backgroundColor: "#4a5e7a" }} /> {/* Lighter navy for divider */}
        <MenuItem
          onClick={() => handlePanAction("panUp")}
          sx={{
            color: "#001f3f", // Navy blue text
            "&:hover": { backgroundColor: "#f5f7fa" }, // Light gray-blue on hover
          }}
        >
          Pan Up
        </MenuItem>
        <MenuItem
          onClick={() => handlePanAction("panDown")}
          sx={{
            color: "#001f3f", // Navy blue text
            "&:hover": { backgroundColor: "#f5f7fa" }, // Light gray-blue on hover
          }}
        >
          Pan Down
        </MenuItem>
      </Menu>
    </>
  );
};

export default PanControls;