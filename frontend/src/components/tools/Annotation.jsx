import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Button,
  Divider,
  Box
} from '@mui/material';
import {
  PanTool as PanIcon,
  ZoomIn as ZoomIcon,
  Straighten as LengthIcon,
  TrendingUp as AngleIcon,
  Brightness6 as WwwcIcon,
  CropFree as RectangleIcon,
  RadioButtonUnchecked as EllipseIcon,
  Delete as DeleteIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import * as cornerstoneTools from 'cornerstone-tools';

const AnnotationTools = ({ 
  viewerRef, 
  isImageLoaded, 
  activeTool, 
  setActiveTool,
  annotations,
  onSaveAnnotations 
}) => {
  const [toolData, setToolData] = useState([]);

  const tools = [
    { name: 'Wwwc', icon: <WwwcIcon />, label: 'Window/Level' },
    { name: 'Pan', icon: <PanIcon />, label: 'Pan' },
    { name: 'Zoom', icon: <ZoomIcon />, label: 'Zoom' },
    { name: 'Length', icon: <LengthIcon />, label: 'Length' },
    { name: 'Angle', icon: <AngleIcon />, label: 'Angle' },
    { name: 'RectangleRoi', icon: <RectangleIcon />, label: 'Rectangle ROI' },
    { name: 'EllipticalRoi', icon: <EllipseIcon />, label: 'Ellipse ROI' }
  ];

  const handleToolChange = (event, newTool) => {
    if (newTool && isImageLoaded) {
      setActiveTool(newTool);
      cornerstoneTools.setToolActive(newTool, { mouseButtonMask: 1 });
      
      // Set other tools to passive
      tools.forEach(tool => {
        if (tool.name !== newTool) {
          cornerstoneTools.setToolPassive(tool.name);
        }
      });
    }
  };

  const getToolData = () => {
    const element = viewerRef.current;
    if (!element || !isImageLoaded) return;

    try {
      const lengthData = cornerstoneTools.getToolState(element, 'Length');
      const angleData = cornerstoneTools.getToolState(element, 'Angle');
      const rectData = cornerstoneTools.getToolState(element, 'RectangleRoi');
      const ellipseData = cornerstoneTools.getToolState(element, 'EllipticalRoi');

      const allData = [];
      
      if (lengthData) {
        lengthData.data.forEach((data, index) => {
          allData.push({
            id: `length_${index}`,
            type: 'Length',
            data: data,
            measurement: data.length ? `${data.length.toFixed(2)} mm` : 'N/A'
          });
        });
      }

      if (angleData) {
        angleData.data.forEach((data, index) => {
          allData.push({
            id: `angle_${index}`,
            type: 'Angle',
            data: data,
            measurement: data.rAngle ? `${data.rAngle.toFixed(1)}°` : 'N/A'
          });
        });
      }

      if (rectData) {
        rectData.data.forEach((data, index) => {
          allData.push({
            id: `rect_${index}`,
            type: 'Rectangle ROI',
            data: data,
            measurement: data.area ? `${data.area.toFixed(2)} mm²` : 'N/A'
          });
        });
      }

      if (ellipseData) {
        ellipseData.data.forEach((data, index) => {
          allData.push({
            id: `ellipse_${index}`,
            type: 'Ellipse ROI',
            data: data,
            measurement: data.area ? `${data.area.toFixed(2)} mm²` : 'N/A'
          });
        });
      }

      setToolData(allData);
    } catch (err) {
      console.error('Error getting tool data:', err);
    }
  };

  const clearAnnotations = () => {
    const element = viewerRef.current;
    if (!element || !isImageLoaded) return;

    try {
      cornerstoneTools.clearToolState(element, 'Length');
      cornerstoneTools.clearToolState(element, 'Angle');
      cornerstoneTools.clearToolState(element, 'RectangleRoi');
      cornerstoneTools.clearToolState(element, 'EllipticalRoi');
      element.dispatchEvent(new Event('cornerstonetoolsmeasurementmodified'));
      setToolData([]);
    } catch (err) {
      console.error('Error clearing annotations:', err);
    }
  };

  const saveAnnotations = () => {
    getToolData();
    if (onSaveAnnotations) {
      onSaveAnnotations(toolData);
    }
  };

  // Update tool data when measurements change
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const handleMeasurementModified = () => {
      getToolData();
    };

    element.addEventListener('cornerstonetoolsmeasurementmodified', handleMeasurementModified);
    element.addEventListener('cornerstonetoolsmeasurementadded', handleMeasurementModified);
    element.addEventListener('cornerstonetoolsmeasurementremoved', handleMeasurementModified);

    return () => {
      element.removeEventListener('cornerstonetoolsmeasurementmodified', handleMeasurementModified);
      element.removeEventListener('cornerstonetoolsmeasurementadded', handleMeasurementModified);
      element.removeEventListener('cornerstonetoolsmeasurementremoved', handleMeasurementModified);
    };
  }, [isImageLoaded]);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Tools & Annotations
      </Typography>

      {/* Tool Selection */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Active Tool:
      </Typography>
      <ToggleButtonGroup
        value={activeTool}
        exclusive
        onChange={handleToolChange}
        orientation="vertical"
        size="small"
        sx={{ mb: 2, width: '100%' }}
      >
        {tools.map((tool) => (
          <ToggleButton
            key={tool.name}
            value={tool.name}
            disabled={!isImageLoaded}
            sx={{ justifyContent: 'flex-start', px: 1 }}
          >
            {tool.icon}
            <Typography variant="caption" sx={{ ml: 1 }}>
              {tool.label}
            </Typography>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Divider sx={{ my: 2 }} />

      {/* Annotations List */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">
          Measurements ({toolData.length})
        </Typography>
        <Box>
          <IconButton size="small" onClick={getToolData} title="Refresh">
            📊
          </IconButton>
          <IconButton size="small" onClick={clearAnnotations} title="Clear All">
            <DeleteIcon />
          </IconButton>
        </Box>
      </Box>

      <List dense sx={{ maxHeight: 200, overflow: 'auto' }}>
        {toolData.map((item, index) => (
          <ListItem key={item.id} sx={{ px: 1 }}>
            <ListItemText
              primary={item.type}
              secondary={item.measurement}
              primaryTypographyProps={{ variant: 'caption' }}
              secondaryTypographyProps={{ variant: 'body2' }}
            />
          </ListItem>
        ))}
        {toolData.length === 0 && (
          <ListItem>
            <ListItemText 
              primary="No measurements"
              primaryTypographyProps={{ variant: 'caption', style: { fontStyle: 'italic' } }}
            />
          </ListItem>
        )}
      </List>

      <Button
        fullWidth
        variant="contained"
        startIcon={<SaveIcon />}
        onClick={saveAnnotations}
        disabled={!isImageLoaded}
        sx={{ mt: 1 }}
      >
        Save Annotations
      </Button>
    </Paper>
  );
};

export default AnnotationTools;