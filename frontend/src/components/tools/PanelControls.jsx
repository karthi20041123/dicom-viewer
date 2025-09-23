import React, { useState } from "react";
import { Button, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import {
  GridView,
  ViewColumn,
  ViewComfy,
  ViewCompact,
  ViewQuilt,
  Apps,
  Dashboard,
  TableChart,
  ViewModule,
  ViewStream,
  ViewArray,
  CalendarViewMonth,
  GridOn,
  ViewWeek,
  ViewDay
} from "@mui/icons-material";

const PanelControls = ({ onLayoutChange, currentLayout = "1x1" }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLayoutSelect = (layoutId) => {
    onLayoutChange(layoutId);
    handleClose();
  };

  const layoutOptions = [
    { id: "1x1", label: "1x1 Panel", icon: <GridView /> },
    { id: "1x2", label: "1x2 Panel", icon: <ViewColumn /> },
    { id: "1x3", label: "1x3 Panel", icon: <ViewStream /> },
    { id: "1x4", label: "1x4 Panel", icon: <ViewArray /> },
    { id: "2x1", label: "2x1 Panel", icon: <ViewCompact /> },
    { id: "2x2", label: "2x2 Panel", icon: <ViewComfy /> },
    { id: "2x3", label: "2x3 Panel", icon: <ViewQuilt /> },
    { id: "2x4", label: "2x4 Panel", icon: <TableChart /> },
    { id: "3x2", label: "3x2 Panel", icon: <ViewModule /> },
    { id: "3x3", label: "3x3 Panel", icon: <Apps /> },
    { id: "4x2", label: "4x2 Panel", icon: <Dashboard /> },
    { id: "4x4", label: "4x4 Panel", icon: <GridOn /> }
  ];

  const getCurrentLayoutLabel = () => {
    const layout = layoutOptions.find(option => option.id === currentLayout);
    return layout ? layout.label : "Panels";
  };

  return (
    <>
      <Button
        variant="contained"
        onClick={handleClick}
        startIcon={<GridView />}
        sx={{
          color: "#ffffffff",
          backgroundColor: "#6b89a7ff", // Navy blue
          "&:hover": { backgroundColor: "#3b6a99ff" }, // Lighter navy blue
          borderRadius: "8px",
        }}
      >
        {getCurrentLayoutLabel()}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            backgroundColor: "#ffffff", // White background
            color: "#001f3f", // Navy blue text
            minWidth: "180px",
            maxHeight: "400px",
            overflowY: "auto",
            boxShadow: "0 2px 4px rgba(0, 31, 63, 0.2)", // Navy blue shadow
            borderRadius: "8px",
            "& .MuiMenuItem-root": {
              color: "#001f3f",
              "&:hover": {
                backgroundColor: "#f5f7fa", // Light gray-blue
              },
              "&.Mui-selected": {
                backgroundColor: "#7389a0ff", // Lighter navy blue
                "&:hover": {
                  backgroundColor: "#010305ff",
                },
              },
            },
          },
        }}
      >
        {layoutOptions.map((option) => (
          <MenuItem
            key={option.id}
            onClick={() => handleLayoutSelect(option.id)}
            selected={currentLayout === option.id}
          >
            <ListItemIcon sx={{ color: "inherit", minWidth: "36px" }}>
              {option.icon}
            </ListItemIcon>
            <ListItemText primary={option.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default PanelControls;