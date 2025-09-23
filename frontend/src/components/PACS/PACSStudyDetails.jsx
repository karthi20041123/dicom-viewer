import React, { useState, useEffect } from 'react';
import {
  Calendar,
  User,
  FileText,
  Eye,
  Download,
  ArrowLeft,
  Image,
  LogOut,
} from 'lucide-react';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import axios from 'axios';
import PACSInstancesView from './PACSInstancesView';
import "./PACSStudyDetails.css";

const PACSStudyDetails = ({ selectedStudy, onBackToSearch, onViewSeries, onLogout }) => {
  const [study, setStudy] = useState(selectedStudy);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [viewingSeries, setViewingSeries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showLogoutMessage, setShowLogoutMessage] = useState(false);
  const [showLogoutPopup, setShowLogoutPopup] = useState(false);

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

  useEffect(() => {
    cornerstoneWADOImageLoader.configure({
      beforeSend: function (xhr) {
        const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
      }
    });
  }, []);

  useEffect(() => {
    const fetchStudyDetails = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
        const response = await axios.get(`${backendUrl}/api/dicom/study/${selectedStudy.id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.data.success) {
          setStudy(response.data.study);
        }
      } catch (err) {
        console.error('Error fetching study details:', err);
      } finally {
        setLoading(false);
      }
    };

    if (selectedStudy) {
      fetchStudyDetails();
    }
  }, [selectedStudy]);

  const handleSeriesSelect = (series) => {
    setSelectedSeries(series);
  };

  const handleViewSeries = (series) => {
    const paths = series.instances?.map(instance => instance.filePath).filter(Boolean) || [];
    if (paths.length === 0) {
      alert('No DICOM files found in this series!');
      return;
    }
    const imageIds = paths.map(path => `wadouri:${backendUrl}${path}`);
    if (onViewSeries) {
      onViewSeries(imageIds);
    } else {
      console.error('onViewSeries callback is not provided');
      alert('Unable to view series: Viewer callback not available.');
    }
  };

  const handleInstanceView = (series) => {
    setViewingSeries(series);
  };

  const handleBackFromInstances = () => {
    setViewingSeries(null);
  };

  const handleExportSeries = async (seriesToExport = null, format = null) => {
    const targetSeries = seriesToExport || selectedSeries;
    if (!targetSeries && !study) {
      alert('No study or series selected to export!');
      return;
    }
    let instancesToExport = [];
    if (targetSeries) {
      instancesToExport = targetSeries.instances;
    } else if (study) {
      instancesToExport = study.series.flatMap(series => series.instances);
    }
    if (!instancesToExport.length) {
      alert('No images to export!');
      return;
    }
    let selectedFormat = format;
    if (!selectedFormat || selectedFormat === 'zip') {
      selectedFormat = prompt('Select format (jpg/png/dcm):', 'jpg');
      if (!selectedFormat || !['jpg', 'png', 'dcm'].includes(selectedFormat.toLowerCase())) {
        alert('Invalid format! Please choose jpg, png, or dcm.');
        return;
      }
      selectedFormat = selectedFormat.toLowerCase();
    }
    setLoading(true);
    const zip = new JSZip();
    const element = document.createElement('div');
    element.style.width = '512px';
    element.style.height = '512px';
    document.body.appendChild(element);
    try {
      cornerstone.enable(element);
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      for (const instance of instancesToExport) {
        try {
          const url = `${backendUrl}${instance.filePath}`;
          const imageId = `wadouri:${url}`;
          const image = await cornerstone.loadAndCacheImage(imageId);
          if (image) {
            cornerstone.displayImage(element, image);
            const canvas = element.querySelector('canvas');
            if (canvas) {
              let fileData, fileName;
              if (selectedFormat === 'dcm') {
                const response = await fetch(url, { headers });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const buffer = await response.arrayBuffer();
                fileName = instance.originalFilename || instance.filePath.split('/').pop() || `image_${instance.instanceNumber}.dcm`;
                zip.file(fileName, buffer);
              } else {
                if (selectedFormat === 'png') {
                  fileData = canvas.toDataURL('image/png').split(',')[1];
                  fileName = (instance.originalFilename || 'image').replace(/\.[^/.]+$/, '') + `_${instance.instanceNumber}.png`;
                } else if (selectedFormat === 'jpg') {
                  fileData = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
                  fileName = (instance.originalFilename || 'image').replace(/\.[^/.]+$/, '') + `_${instance.instanceNumber}.jpg`;
                }
                if (fileData) {
                  zip.file(fileName, fileData, { base64: true });
                }
              }
            }
          } else {
            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const buffer = await response.arrayBuffer();
            fileName = instance.originalFilename || instance.filePath.split('/').pop() || `image_${instance.instanceNumber}.dcm`;
            zip.file(fileName, buffer);
          }
        } catch (err) {
          console.error(`Export error for instance ${instance.sopInstanceUID}:`, err);
          const url = `${backendUrl}${instance.filePath}`;
          const response = await fetch(url, { headers });
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            fileName = instance.originalFilename || instance.filePath.split('/').pop() || `image_${instance.instanceNumber}.dcm`;
            zip.file(fileName, buffer);
          }
        }
      }
      cornerstone.disable(element);
    } catch (err) {
      console.error('Error during export process:', err);
      alert('An error occurred during export. Check console for details.');
    } finally {
      document.body.removeChild(element);
      setLoading(false);
    }
    if (Object.keys(zip.files).length > 0) {
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(
        zipBlob,
        `exported_${
          targetSeries ? `series_${targetSeries.seriesNumber}` : `study_${study.id}`
        }_${new Date().toISOString().split('T')[0]}.${selectedFormat === 'dcm' ? 'zip' : selectedFormat}`
      );
    } else {
      alert('No files were exported. Check console for errors.');
    }
  };

  const handleLogout = () => {
    // Clear authentication data
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    localStorage.removeItem("tokenExpires");
    sessionStorage.removeItem("authToken");
    sessionStorage.removeItem("user");

    // Show logout message
    setShowLogoutMessage(true);
    
    // Call parent logout callback if provided
    if (onLogout) {
      onLogout();
    }

    // Redirect after showing message
    setTimeout(() => {
      setShowLogoutMessage(false);
      // Navigate back to search results
      if (onBackToSearch) {
        onBackToSearch();
      }
    }, 1500);
  };

  const toggleLogoutPopup = () => {
    setShowLogoutPopup(!showLogoutPopup);
  };

  const getUserInitial = () => {
    const user = JSON.parse(localStorage.getItem("user") || sessionStorage.getItem("user"));
    if (!user) return "U";
    
    const firstName = user?.profile?.firstName;
    if (firstName && firstName.length > 0) return firstName.charAt(0).toUpperCase();

    const username = user?.username;
    if (username && username.length > 0) return username.charAt(0).toUpperCase();

    return "U";
  };

  if (viewingSeries) {
    return (
      <PACSInstancesView
        selectedSeries={viewingSeries}
        selectedStudy={study}
        onBackToDetails={handleBackFromInstances}
        onViewInstance={(files) => {
          console.log('Viewing instance files:', files);
          if (onViewSeries) {
            onViewSeries(files);
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-blue-600 text-white p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">PACS Server</h1>
          <div className="logout-container" style={{ position: 'relative' }}>
            <button
              onClick={toggleLogoutPopup}
              className="flex items-center text-white hover:text-gray-200 bg-blue-700 hover:bg-blue-800 px-3 py-2 rounded-full transition-colors duration-200"
              disabled={loading}
              style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              {getUserInitial()}
            </button>
            {showLogoutPopup && (
              <div 
                className="logout-popup"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  marginTop: '8px',
                  backgroundColor: 'white',
                  color: '#333',
                  border: '1px solid #ccc',
                  borderRadius: '8px',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
                  padding: '8px',
                  minWidth: '120px',
                  zIndex: 1000
                }}
              >
                <button
                  onClick={handleLogout}
                  className="flex items-center text-red-600 hover:text-red-800 w-full px-3 py-2 hover:bg-red-50 rounded transition-colors duration-200"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showLogoutMessage && (
        <div 
          className="logout-message"
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#4CAF50',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
            zIndex: 1000,
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          You have been logged out successfully
        </div>
      )}

      <div className="pacs-container">
        <button 
          onClick={onBackToSearch} 
          className="back-button"
          disabled={loading}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Search
        </button>

        <div className="study-details-section fade-in">
          <div className="search-header">
            <FileText size={28} />
            <h2>Study Details</h2>
          </div>

          <div className="study-info-grid">
            <div className="info-section">
              <h3>
                <User className="w-5 h-5" />
                Patient Information
              </h3>
              <div className="info-item">
                <span className="info-label">Name:</span>
                <span className="info-value">{study.patientName}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Patient ID:</span>
                <span className="info-value">{study.patientID}</span>
              </div>
            </div>

            <div className="info-section">
              <h3>
                <Calendar className="w-5 h-5" />
                Study Information
              </h3>
              <div className="info-item">
                <span className="info-label">Date:</span>
                <span className="info-value">
                  {study.studyDate ? new Date(study.studyDate).toLocaleDateString() : 'Unknown'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Time:</span>
                <span className="info-value">{study.studyTime}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Modality:</span>
                <span className="info-value">{study.modality}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Description:</span>
                <span className="info-value">{study.studyDescription}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Accession:</span>
                <span className="info-value">{study.accessionNumber}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end mb-4">
            <button
              onClick={() => handleExportSeries(null)}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
            >
              <Download className="mr-2 w-4 h-4" />
              Export Entire Study
            </button>
          </div>
        </div>

        <div className="results-section scale-in">
          <div className="results-header">
            <h3>
              Series Collection
              <span className="results-count">{study.series.length}</span>
            </h3>
          </div>

          <div className="series-grid">
            {study.series.map((series) => (
              <div 
                key={series.id} 
                className={`series-card ${selectedSeries?.id === series.id ? 'selected' : ''}`}
              >
                <div className="series-header">
                  <h4 className="series-number">Series {series.seriesNumber}</h4>
                  <span className="series-modality">{series.modality}</span>
                </div>

                <div className="series-description">{series.seriesDescription}</div>
                <div className="series-meta">{series.numberOfInstances} images</div>

                <div className="series-actions">
                  <button 
                    onClick={() => handleViewSeries(series)} 
                    className="series-view-btn"
                    disabled={loading}
                  >
                    <Eye className="w-4 h-4" />
                    View Series
                  </button>
                  <button
                    onClick={() => handleInstanceView(series)}
                    className="series-view-btn bg-blue-600 hover:bg-blue-700"
                    disabled={loading}
                  >
                    <Image className="w-4 h-4" />
                    Instances
                  </button>
                  <button
                    onClick={() => handleExportSeries(series)}
                    className="series-download-btn"
                    disabled={loading}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedSeries && (
          <div className="selected-series-info fade-in">
            <h4>Selected Series: {selectedSeries.seriesDescription}</h4>
            <p>Series {selectedSeries.seriesNumber} - {selectedSeries.numberOfInstances} images</p>
          </div>
        )}

        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Processing export...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PACSStudyDetails;