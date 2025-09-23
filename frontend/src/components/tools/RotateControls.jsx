import React, { useState } from "react";
import { Menu, MenuItem, ListItemIcon, ListItemText, Button, Typography } from "@mui/material";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import FlipIcon from "@mui/icons-material/Flip";
import RestoreIcon from "@mui/icons-material/Restore";
import * as cornerstone from "cornerstone-core";

const RotateControls = ({ viewerRef }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const applyRotate = (action) => {
    const element = viewerRef?.current;
    if (!element) return;
    if (!cornerstone.getImage(element)) return;

    let viewport = cornerstone.getViewport(element);

    switch (action) {
      case "left":
        viewport.rotation = (viewport.rotation - 90 + 360) % 360;
        break;
      case "right":
        viewport.rotation = (viewport.rotation + 90) % 360;
        break;
      case "vertical":
        viewport.vflip = !viewport.vflip;
        break;
      case "horizontal":
        viewport.hflip = !viewport.hflip;
        break;
      case "clear":
        viewport.rotation = 0;
        viewport.vflip = false;
        viewport.hflip = false;
        break;
      default:
        return;
    }

    cornerstone.setViewport(element, viewport);
    cornerstone.updateImage(element); // removed extra arg
    handleMenuClose();
  };

  return (
    <>
      <Button color="inherit" onClick={handleMenuOpen} startIcon={<RotateRightIcon />}>
        Rotate
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleMenuClose}
        sx={{
          "& .MuiPaper-root": {
            backgroundColor: "#000000", // Black background for menu
            borderRadius: "4px",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
          },
        }}
      >
        <Typography
          sx={{
            px: 2,
            py: 1,
            fontWeight: "bold",
            backgroundColor: "#001f3f", // Navy blue for title
            color: "#ffffff", // White text for title
            borderTopLeftRadius: "4px",
            borderTopRightRadius: "4px",
          }}
        >
          Rotate Options
        </Typography>
        <MenuItem
          onClick={() => applyRotate("right")}
          sx={{
            "& .MuiListItemIcon-root": { color: "#000000ff" }, // White icon
            "& .MuiListItemText-primary": { color: "#000000ff" }, // White primary text
            "& .MuiListItemText-secondary": { color: "#000000ff" }, // Light gray secondary text
            "&:hover": { backgroundColor: "#003087" }, // Navy blue on hover
            borderBottom: "1px solid #333333", // Dark gray separator
            backgroundColor: "#ffffffff", // Ensure black background
          }}
        >
          <ListItemIcon><RotateRightIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Rotate Right" secondary="Shift + R" />
        </MenuItem>
        <MenuItem
          onClick={() => applyRotate("left")}
          sx={{
            "& .MuiListItemIcon-root": { color: "#000000ff" },
            "& .MuiListItemText-primary": { color: "#000000ff" },
            "& .MuiListItemText-secondary": { color: "#000000ff" },
            "&:hover": { backgroundColor: "#003087" },
            borderBottom: "1px solid #333333",
            backgroundColor: "#ffffffff",
          }}
        >
          <ListItemIcon><RotateLeftIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Rotate Left" secondary="Shift + L" />
        </MenuItem>
        <MenuItem
          onClick={() => applyRotate("horizontal")}
          sx={{
            "& .MuiListItemIcon-root": { color: "#000000ff" },
            "& .MuiListItemText-primary": { color: "#000000ff" },
            "& .MuiListItemText-secondary": { color: "#000000ff" },
            "&:hover": { backgroundColor: "#003087" },
            borderBottom: "1px solid #333333",
            backgroundColor: "#ffffffff",
          }}
        >
          <ListItemIcon><FlipIcon style={{ transform: "rotate(90deg)" }} fontSize="small" /></ListItemIcon>
          <ListItemText primary="Flip Horizontal" secondary="Shift + H" />
        </MenuItem>
        <MenuItem
          onClick={() => applyRotate("vertical")}
          sx={{
            "& .MuiListItemIcon-root": { color: "#000000ff" },
            "& .MuiListItemText-primary": { color: "#000000ff" },
            "& .MuiListItemText-secondary": { color: "#000000ff" },
            "&:hover": { backgroundColor: "#003087" },
            borderBottom: "1px solid #333333",
            backgroundColor: "#ffffffff",
          }}
        >
          <ListItemIcon><FlipIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Flip Vertical" secondary="Shift + V" />
        </MenuItem>
        <MenuItem
          onClick={() => applyRotate("clear")}
          sx={{
            "& .MuiListItemIcon-root": { color: "#000000ff" },
            "& .MuiListItemText-primary": { color: "#000000ff" },
            "& .MuiListItemText-secondary": { color: "#000000ff" },
            "&:hover": { backgroundColor: "#003087" },
            backgroundColor: "#ffffffff",
          }}
        >
          <ListItemIcon><RestoreIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Clear Transform" secondary="Shift + Delete" />
        </MenuItem>
      </Menu>
    </>
  );
};

export default RotateControls;