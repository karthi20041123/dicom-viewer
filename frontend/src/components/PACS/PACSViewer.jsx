import React, { useState } from 'react';
import PACSSearchResults from './PACSSearchResults';
import PACSStudyDetails from './PACSStudyDetails';
import PACSInstancesView from './PACSInstancesView';

const PACSMainApp = () => {
  const [currentView, setCurrentView] = useState('search');
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);

  const handleStudySelect = (study) => {
    setSelectedStudy(study);
    setCurrentView('studyDetails');
  };

  const handleBackToSearch = () => {
    setCurrentView('search');
    setSelectedStudy(null);
    setSelectedSeries(null);
  };

  const handleSeriesSelect = (series, study) => {
    setSelectedSeries(series);
    setSelectedStudy(study);
    setCurrentView('instancesView');
  };

  const handleBackToStudyDetails = () => {
    setCurrentView('studyDetails');
    setSelectedSeries(null);
  };

  const handleViewSeries = (files) => {
    // This function can be used to integrate with a DICOM viewer
    console.log('View series with files:', files);
    // You can implement your DICOM viewer logic here
    // For example, open a modal or navigate to a viewer component
  };

  const handleViewInstance = (files) => {
    // This function handles viewing individual instances
    console.log('View instance with files:', files);
    // You can implement your DICOM instance viewer logic here
  };

  return (
    <div>
      {currentView === 'search' && (
        <PACSSearchResults
          onStudySelect={handleStudySelect}
          onViewSeries={handleViewSeries}
        />
      )}
      
      {currentView === 'studyDetails' && (
        <PACSStudyDetails
          selectedStudy={selectedStudy}
          onBackToSearch={handleBackToSearch}
          onViewSeries={handleViewSeries}
          onSeriesSelect={handleSeriesSelect}
        />
      )}

      {currentView === 'instancesView' && (
        <PACSInstancesView
          selectedSeries={selectedSeries}
          selectedStudy={selectedStudy}
          onBackToDetails={handleBackToStudyDetails}
          onViewInstance={handleViewInstance}
        />
      )}
    </div>
  );
};

export default PACSMainApp;