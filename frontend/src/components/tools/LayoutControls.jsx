import React, { useState } from "react";
import { Button, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import {
  ViewModule,
  ViewColumn,
  ViewStream,
  ViewArray,
  ViewCompact,
  ViewComfy,
  ViewQuilt,
  TableChart,
  Dashboard,
  GridOn,
  CalendarViewMonth,
  ViewWeek,
  Apps,
  GridView,
  ViewDay,
  Reorder
} from "@mui/icons-material";

const LayoutControls = ({ onLayoutChange, currentLayout = "1x1" }) => {
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
    { id: "1x1", label: "1x1 Layout", icon: <GridView /> },
    { id: "1x2", label: "1x2 Layout", icon: <ViewColumn /> },
    { id: "1x3", label: "1x3 Layout", icon: <ViewStream /> },
    { id: "1x4", label: "1x4 Layout", icon: <ViewArray /> },
    { id: "1x5", label: "1x5 Layout", icon: <Reorder /> },
    { id: "2x1", label: "2x1 Layout", icon: <ViewCompact /> },
    { id: "2x2", label: "2x2 Layout", icon: <ViewComfy /> },
    { id: "2x3", label: "2x3 Layout", icon: <ViewQuilt /> },
    { id: "2x4", label: "2x4 Layout", icon: <TableChart /> },
    { id: "2x5", label: "2x5 Layout", icon: <ViewWeek /> },
    { id: "2x6", label: "2x6 Layout", icon: <CalendarViewMonth /> },
    { id: "3x2", label: "3x2 Layout", icon: <ViewModule /> },
    { id: "3x3", label: "3x3 Layout", icon: <Apps /> },
    { id: "4x2", label: "4x2 Layout", icon: <Dashboard /> },
    { id: "4x4", label: "4x4 Layout", icon: <GridOn /> }
  ];

  const getCurrentLayoutLabel = () => {
    const layout = layoutOptions.find(option => option.id === currentLayout);
    return layout ? layout.label : "Layout";
  };

  return (
    <>
      <Button
        variant="contained"
        onClick={handleClick}
        startIcon={<Apps />}
        sx={{
          color: "#ffffff", // White text
          backgroundColor: "#001f3f", // Navy blue background
          "&:hover": { backgroundColor: "#003366" }, // Lighter navy blue on hover
          fontFamily: "LemonMilk, sans-serif",
          textTransform: "none",
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
            backgroundColor: "#ffffff", // White background for menu
            color: "#001f3f", // Navy blue text
            minWidth: "180px",
            maxHeight: "400px",
            overflowY: "auto",
            boxShadow: "0 2px 4px rgba(0, 31, 63, 0.2)", // Navy blue shadow
            borderRadius: "8px",
            "& .MuiMenuItem-root": {
              color: "#001f3f", // Navy blue text
              backgroundColor: "#ffffff", // White background
              "&:hover": {
                backgroundColor: "#f5f7fa", // Light gray-blue on hover
              },
              "&.Mui-selected": {
                backgroundColor: "#ffffffff", // Lighter navy blue for selected
                "&:hover": {
                  backgroundColor: "#f5f7fa", // Navy blue on hover when selected
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

export default LayoutControls;