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
import './PACSStudyDetails.css';

const PACSStudyDetails = ({ selectedStudy, onBackToSearch, onViewSeries, onLogout }) => {
  const [study, setStudy] = useState(null); // Initialize as null
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [viewingSeries, setViewingSeries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showLogoutMessage, setShowLogoutMessage] = useState(false);

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
      if (!selectedStudy || !selectedStudy.id) {
        console.warn('No valid study selected for fetching details');
        setStudy(null); // Ensure study is null if selectedStudy is invalid
        return;
      }

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
        } else {
          console.error('Failed to fetch study details:', response.data.message);
          setStudy(null); // Set to null on failure
        }
      } catch (err) {
        console.error('Error fetching study details:', err);
        setStudy(null); // Set to null on error
      } finally {
        setLoading(false);
      }
    };

    fetchStudyDetails();
  }, [selectedStudy, backendUrl]);

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
                fileName = instance.filename || `image_${instance.instanceNumber}.dcm`;
                zip.file(fileName, buffer);
              } else {
                if (selectedFormat === 'png') {
                  fileData = canvas.toDataURL('image/png').split(',')[1];
                  fileName = `${instance.filename || 'image'}_${instance.instanceNumber}.png`;
                } else if (selectedFormat === 'jpg') {
                  fileData = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
                  fileName = `${instance.filename || 'image'}_${instance.instanceNumber}.jpg`;
                }
                if (fileData) {
                  zip.file(fileName, fileData, { base64: true });
                }
              }
            }
          }
        } catch (err) {
          console.error(`Export error for instance ${instance.sopInstanceUID}:`, err);
          const url = `${backendUrl}${instance.filePath}`;
          const response = await fetch(url, { headers });
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            fileName = instance.filename || `image_${instance.instanceNumber}.dcm`;
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
      const fileName = `study_${study.patientName}_${new Date().toISOString().split('T')[0]}.zip`;
      saveAs(zipBlob, fileName);
    } else {
      alert('No files were exported. Check console for errors.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('tokenExpires');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('user');

    setShowLogoutMessage(true);
    
    if (onLogout) {
      onLogout();
    }

    setTimeout(() => {
      setShowLogoutMessage(false);
      if (onBackToSearch) {
        onBackToSearch();
      }
    }, 1500);
  };

  const getUserInitial = () => {
    const user = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    if (!user) return 'U';
    const firstName = user?.profile?.firstName;
    if (firstName && firstName.length > 0) return firstName.charAt(0).toUpperCase();
    const username = user?.username;
    if (username && username.length > 0) return username.charAt(0).toUpperCase();
    return 'U';
  };

  if (viewingSeries) {
    return (
      <PACSInstancesView
        selectedSeries={viewingSeries}
        selectedStudy={study}
        onBackToDetails={handleBackFromInstances}
        onViewInstance={(imageIds) => onViewSeries(imageIds)}
        backendUrl={backendUrl}
      />
    );
  }

  return (
    <>
      <div className="pacssd-header">
        <div className="pacssd-max-w-7xl pacssd-mx-auto pacssd-flex pacssd-justify-between pacssd-items-center">
          <h1 className="pacssd-text-2xl pacssd-font-bold">PACS Server</h1>
          <div className="pacssd-user-controls">
            <button
              className="pacssd-user-initial-btn"
              disabled={loading}
            >
              {getUserInitial()}
            </button>
            <button
              onClick={handleLogout}
              className="pacssd-logout-btn"
              disabled={loading}
            >
              <LogOut className="pacssd-w-4 pacssd-h-4 pacssd-mr-2" />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="pacssd-min-h-screen pacssd-bg-gray-100">
        {showLogoutMessage && (
          <div className="pacssd-logout-message">
            You have been logged out successfully
          </div>
        )}

        <div className="pacssd-pacs-container">
          <button 
            onClick={onBackToSearch} 
            className="pacssd-back-button"
            disabled={loading}
          >
            <ArrowLeft className="pacssd-w-4 pacssd-h-4" />
            Back to Search
          </button>

          <div className="pacssd-study-details-section pacssd-fade-in">
            <div className="pacssd-search-header">
              <FileText size={28} />
              <h2>Study Details</h2>
            </div>

            {study ? ( // Conditional rendering to prevent null access
              <div className="pacssd-study-info-grid">
                <div className="pacssd-info-section">
                  <h3>
                    <User className="pacssd-w-5 pacssd-h-5" />
                    Patient Information
                  </h3>
                  <div className="pacssd-info-item">
                    <span className="pacssd-info-label">Name:</span>
                    <span className="pacssd-info-value">{study.patientName}</span>
                  </div>
                  <div className="pacssd-info-item">
                    <span className="pacssd-info-label">Patient ID:</span>
                    <span className="pacssd-info-value">{study.patientID}</span>
                  </div>
                </div>

                <div className="pacssd-info-section">
                  <h3>
                    <Calendar className="pacssd-w-5 pacssd-h-5" />
                    Study Information
                  </h3>
                  <div className="pacssd-info-item">
                    <span className="pacssd-info-label">Date:</span>
                    <span className="pacssd-info-value">
                      {study.studyDate ? new Date(study.studyDate).toLocaleDateString() : 'Unknown'}
                    </span>
                  </div>
                  <div className="pacssd-info-item">
                    <span className="pacssd-info-label">Time:</span>
                    <span className="pacssd-info-value">{study.studyTime || 'Unknown'}</span>
                  </div>
                  <div className="pacssd-info-item">
                    <span className="pacssd-info-label">Modality:</span>
                    <span className="pacssd-info-value">{study.modality || 'N/A'}</span>
                  </div>
                  <div className="pacssd-info-item">
                    <span className="pacssd-info-label">Description:</span>
                    <span className="pacssd-info-value">{study.studyDescription || 'N/A'}</span>
                  </div>
                  <div className="pacssd-info-item">
                    <span className="pacssd-info-label">Accession:</span>
                    <span className="pacssd-info-value">{study.accessionNumber || 'N/A'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pacssd-no-study-message">
                No study details available. Please select a valid study.
              </div>
            )}

            <div className="pacssd-flex pacssd-justify-end pacssd-mb-4">
              <button
                onClick={() => handleExportSeries(null)}
                disabled={loading || !study}
                className="pacssd-export-study-btn"
              >
                <Download className="pacssd-mr-2 pacssd-w-4 pacssd-h-4" />
                Export Entire Study
              </button>
            </div>
          </div>

          {study && ( // Conditional rendering for series grid
            <div className="pacssd-results-section pacssd-scale-in">
              <div className="pacssd-results-header">
                <h3>
                  Series Collection
                  <span className="pacssd-results-count">{study.series.length}</span>
                </h3>
              </div>

              <div className="pacssd-series-grid">
                {study.series.map((series) => (
                  <div 
                    key={series.id} 
                    className={`pacssd-series-card ${selectedSeries?.id === series.id ? 'pacssd-selected' : ''}`}
                  >
                    <div className="pacssd-series-header">
                      <h4 className="pacssd-series-number">Series {series.seriesNumber}</h4>
                      <span className="pacssd-series-modality">{series.modality}</span>
                    </div>

                    <div className="pacssd-series-description">{series.seriesDescription}</div>
                    <div className="pacssd-series-meta">{series.numberOfInstances} images</div>

                    <div className="pacssd-series-actions">
                      <button 
                        onClick={() => handleViewSeries(series)} 
                        className="pacssd-series-view-btn"
                        disabled={loading}
                      >
                        <Eye className="pacssd-w-4 pacssd-h-4" />
                        View Series
                      </button>
                      <button
                        onClick={() => handleInstanceView(series)}
                        className="pacssd-series-instances-btn"
                        disabled={loading}
                      >
                        <Image className="pacssd-w-4 pacssd-h-4" />
                        Instances
                      </button>
                      <button
                        onClick={() => handleExportSeries(series)}
                        className="pacssd-series-download-btn"
                        disabled={loading}
                      >
                        <Download className="pacssd-w-4 pacssd-h-4" />
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedSeries && (
            <div className="pacssd-selected-series-info pacssd-fade-in">
              <h4>Selected Series: {selectedSeries.seriesDescription}</h4>
              <p>Series {selectedSeries.seriesNumber} - {selectedSeries.numberOfInstances} images</p>
            </div>
          )}

          {loading && (
            <div className="pacssd-loading-overlay">
              <div className="pacssd-loading-spinner">
                <div className="pacssd-spinner"></div>
                <p>Processing export...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PACSStudyDetails;