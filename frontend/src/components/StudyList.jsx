import React from 'react';
import { List, ListItem, ListItemText, Typography, Card, CardContent } from '@mui/material';
import styled from 'styled-components';

const StudyCard = styled(Card)`
  margin-bottom: 16px;
  cursor: pointer;
  &:hover {
    background-color: #e0e0e0;
  }
`;

function StudyList({ studies, onSelectStudy }) {
  if (!studies.length) {
    return <Typography>No studies available</Typography>;
  }

  return (
    <div>
      <Typography variant="h5" gutterBottom>DICOM Studies</Typography>
      <List>
        {studies.map(study => (
          <StudyCard key={study._id} onClick={() => {
            console.log('Selected study:', study); // Log for debugging
            onSelectStudy(study);
          }}>
            <CardContent>
              <ListItem>
                <ListItemText
                  primary={`Patient: ${study.patient?.patientName || 'Unknown'}`}
                  secondary={
                    <>
                      <Typography variant="body2">Study UID: {study.studyInstanceUID}</Typography>
                      <Typography variant="body2">Series UID: ${study.seriesUID}</Typography>
                      <Typography variant="body2">Instance UID: ${study.sopInstanceUID}</Typography>
                      <Typography variant="body2">Modality: ${study.modality}</Typography>
                      <Typography variant="body2">Date: ${new Date(study.imageDate).toLocaleDateString()}</Typography>
                    </>
                  }
                />
              </ListItem>
            </CardContent>
          </StudyCard>
        ))}
      </List>
    </div>
  );
}

export default StudyList;