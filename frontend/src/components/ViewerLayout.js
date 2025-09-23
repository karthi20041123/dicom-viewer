import React from 'react';
import { Button, Box, Typography } from '@mui/material';
import DicomViewer from './DicomViewer';
import Toolbar from './Toolbar';
import styles from './ViewerLayout.module.css';

function ViewerLayout({ study, onBack }) {
  return (
    <Box className={styles.container}>
      <Button variant="contained" onClick={onBack} sx={{ m: 1 }}>
        Back to Study List
      </Button>
      <Box className={styles.layout}>
        <Box className={styles.sidebar}>
          <Typography variant="h6">Study Details</Typography>
          <Typography>Patient: {study.patient?.patientName || 'Unknown'}</Typography>
          <Typography>Study UID: {study.studyInstanceUID}</Typography>
          <Typography>Modality: {study.modality}</Typography>
        </Box>
        <Box className={styles.main}>
          <Toolbar />
          <DicomViewer study={study} />
        </Box>
      </Box>
    </Box>
  );
}

export default ViewerLayout;