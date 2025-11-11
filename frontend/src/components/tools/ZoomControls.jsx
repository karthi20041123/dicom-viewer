import React, { useState } from "react";
import { Button, Menu, MenuItem, Typography, Divider, IconButton, Box } from "@mui/material";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneTools from "cornerstone-tools";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";

const ZoomControls = ({ viewerRef, isElementEnabled, isImageLoaded, activeTool, handleToolChange, onViewportChange }) => {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const activateZoom = (mode, shouldClose = true) => {
    const element = viewerRef?.current;
    if (!element || !isElementEnabled || !isImageLoaded) return;

    handleToolChange("Zoom");

    try {
      cornerstoneTools.setToolDisabled("Zoom");
      cornerstoneTools.setToolDisabled("ZoomTouchPinchZoom");

      const viewport = cornerstone.getViewport(element);

      switch (mode) {
        case "fitToScreen":
          cornerstone.fitToWindow(element);
          break;

        case "originalResolution":
          viewport.scale = 1.0;
          cornerstone.setViewport(element, viewport);
          break;

        case "zoomSelection":
          cornerstoneTools.setToolActive("Zoom", { mouseButtonMask: 1, isZoomSelectionActive: true });
          break;

        case "zoomIn":
          viewport.scale = (viewport.scale || 1) * 1.5;
          cornerstone.setViewport(element, viewport);
          break;

        case "zoomOut":
          viewport.scale = (viewport.scale || 1) * 0.5;
          cornerstone.setViewport(element, viewport);
          break;

        default:
          cornerstoneTools.setToolActive("Zoom", { mouseButtonMask: 1 });
      }

      cornerstone.updateImage(element); // ensure events fire
      
      // Notify parent component about viewport change
      if (onViewportChange) {
        const updatedViewport = cornerstone.getViewport(element);
        onViewportChange(updatedViewport.scale || 1);
      }
    } catch (err) {
      console.error("Error activating zoom:", err);
    }

    if (shouldClose) handleClose();
  };

  return (
    <>
      <Button
        variant="outlined"
        onClick={handleOpen}
        sx={{ 
          ...(activeTool === "Zoom" && { 
            backgroundColor: "#001f3f", // Navy blue when active
            color: "#ffffff", // White text
            "&:hover": {
              backgroundColor: "#003366", // Lighter navy blue on hover
            }
          }),
          backgroundColor: "#001f3f", // Navy blue default
          color: "#ffffff", // White text
          borderColor: "#001f3f", // Navy blue border
          "&:hover": {
            backgroundColor: "#003366", // Lighter navy blue on hover
            borderColor: "#003366",
          },
          fontFamily: "LemonMilk, sans-serif",
          textTransform: "none",
        }}
      >
        Zoom
      </Button>
      <Menu 
        anchorEl={anchorEl} 
        open={Boolean(anchorEl)} 
        onClose={handleClose}
        PaperProps={{
          sx: {
            backgroundColor: "#ffffff", // White background for menu
            color: "#001f3f", // Navy blue text
            boxShadow: "0 2px 4px rgba(0, 31, 63, 0.2)", // Navy blue shadow
          }
        }}
      >
        <Typography sx={{ 
          px: 2, 
          py: 1, 
          fontWeight: "bold", 
          backgroundColor: "#001f3f", // Navy blue header
          color: "#ffffff" // White text
        }}>
          Zoom Options
        </Typography>
        <MenuItem 
          onClick={() => activateZoom("fitToScreen")} 
          sx={{ 
            backgroundColor: "#ffffff", // White background
            color: "#001f3f", // Navy blue text
            borderBottom: "1px solid #333333",
            "&:hover": {
              backgroundColor: "#f5f7fa", // Light gray-blue hover
            }
          }}
        >
          Fit To Screen&nbsp;&nbsp;&nbsp;<small style={{ color: "#003366" }}>Ctrl + 0</small>
        </MenuItem>
        <MenuItem 
          onClick={() => activateZoom("originalResolution")} 
          sx={{ 
            backgroundColor: "#ffffff", // White background
            color: "#001f3f", // Navy blue text
            borderBottom: "1px solid #333333",
            "&:hover": {
              backgroundColor: "#f5f7fa", // Light gray-blue hover
            }
          }}
        >
          Original Resolution&nbsp;&nbsp;&nbsp;<small style={{ color: "#003366" }}>Ctrl + 1</small>
        </MenuItem>
        <MenuItem 
          onClick={() => activateZoom("zoomSelection")} 
          sx={{ 
            
            backgroundColor: "#ffffff", // White background
            color: "#001f3f", // Navy blue text
            "&:hover": {
              backgroundColor: "#f5f7fa", // Light gray-blue hover
            }
          }}
        >
          Zoom Selection&nbsp;&nbsp;&nbsp;<small style={{ color: "#003366" }}>Ctrl + 9</small>
        </MenuItem>
        <Divider sx={{ backgroundColor: "#ffffff" }} /> {/* Navy blue divider */}
        <MenuItem 
          disableRipple 
          sx={{ 
            backgroundColor: "#ffffff", // White background
            color: "#001f3f", // Navy blue text
            "&:hover": {
              backgroundColor: "#f5f7fa", // Light gray-blue hover
            }
          }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
            <Typography variant="body2">Zoom</Typography>
            <Box>
              <IconButton 
                size="small" 
                onClick={() => activateZoom("zoomOut", false)} 
                sx={{ 
                  color: "#001f3f", // Navy blue icon
                  "&:hover": {
                    backgroundColor: "#f5f7fa", // Light gray-blue hover
                  }
                }}
              >
                <RemoveIcon />
              </IconButton>
              <IconButton 
                size="small" 
                onClick={() => activateZoom("zoomIn", false)} 
                sx={{ 
                  color: "#001f3f", // Navy blue icon
                  "&:hover": {
                    backgroundColor: "#f5f7fa", // Light gray-blue hover
                  }
                }}
              >
                <AddIcon />
              </IconButton>
            </Box>
          </Box>
        </MenuItem>
      </Menu>
    </>
  );
};

export default ZoomControls;