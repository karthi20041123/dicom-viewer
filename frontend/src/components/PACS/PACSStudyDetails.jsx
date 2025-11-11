import React, { useState, useEffect } from 'react';
import {
  Calendar,
  User,
  FileText,
  Eye,
  Download,
  ArrowLeft,
  Image,
} from 'lucide-react';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import PACSInstancesView from './PACSInstancesView';
import './PACSStudyDetails.css';

const PACSStudyDetails = ({ selectedStudy, onBackToSearch, onViewSeries }) => {
  const [study, setStudy] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [viewingSeries, setViewingSeries] = useState(null);
  const [loading, setLoading] = useState(false);

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
    if (!selectedStudy || !selectedStudy.id) {
      console.warn('No valid study selected');
      setStudy(null);
      return;
    }
    setStudy(selectedStudy);
  }, [selectedStudy]);

  const handleSeriesSelect = (series) => {
    setSelectedSeries(series);
  };

  const handleViewSeries = (series) => {
    const instances = series.instances || [];
    if (instances.length === 0) {
      alert('No DICOM files found in this series!');
      return;
    }
    // Generate wadouri image IDs from local file blobs
    const imageIds = instances
      .filter((instance) => instance.file)
      .map((instance) => `wadouri:${URL.createObjectURL(instance.file)}`);
    if (imageIds.length === 0) {
      alert('No valid DICOM files available to view!');
      return;
    }
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
      instancesToExport = targetSeries.instances || [];
    } else if (study) {
      instancesToExport = study.series.flatMap((series) => series.instances || []);
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
    
    // Create a temporary div for rendering
    const element = document.createElement('div');
    element.style.width = '512px';
    element.style.height = '512px';
    element.style.position = 'absolute';
    element.style.left = '-9999px';
    element.style.top = '-9999px';
    document.body.appendChild(element);

    try {
      cornerstone.enable(element);
      
      for (const instance of instancesToExport) {
        try {
          if (!instance.file) {
            console.warn(`No file object for instance ${instance.sopInstanceUID}`);
            continue;
          }
          
          const blobUrl = URL.createObjectURL(instance.file);
          const imageId = `wadouri:${blobUrl}`;
          
          if (selectedFormat === 'dcm') {
            const fileName = instance.filename || `image_${instance.instanceNumber}.dcm`;
            zip.file(fileName, instance.file);
          } else {
            const image = await cornerstone.loadAndCacheImage(imageId);
            if (image) {
              cornerstone.displayImage(element, image);
              await new Promise((resolve) => setTimeout(resolve, 100));
              
              const canvas = element.querySelector('canvas');
              if (canvas) {
                // Convert canvas to blob
                const blob = await new Promise((resolve) => {
                  canvas.toBlob(
                    resolve,
                    selectedFormat === 'png' ? 'image/png' : 'image/jpeg',
                    0.9
                  );
                });

                const fileName = `${instance.filename || 'image'}_${instance.instanceNumber}.${selectedFormat}`;
                if (blob) {
                  zip.file(fileName, blob);
                }
              }
            }
            URL.revokeObjectURL(blobUrl);
          }
        } catch (err) {
          console.error(`Export error for instance ${instance.sopInstanceUID}:`, err);
          // Fallback: save as DICOM
          if (selectedFormat === 'dcm' && instance.file) {
            const fileName = instance.filename || `image_${instance.instanceNumber}.dcm`;
            zip.file(fileName, instance.file);
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
      const fileName = `study_${study?.patientName || 'unknown'}_${new Date().toISOString().split('T')[0]}.zip`;
      saveAs(zipBlob, fileName);
      alert(`Successfully exported ${Object.keys(zip.files).length} file(s)!`);
    } else {
      alert('No files were exported. Check console for errors.');
    }
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
      />
    );
  }

  return (
    <>
      <div className="pacssd-header">
        <div className="pacssd-max-w-7xl pacssd-mx-auto pacssd-flex pacssd-items-center">
          <div className="pacssd-header-left">
            <button 
              onClick={onBackToSearch} 
              className="pacssd-back-button"
              disabled={loading}
            >
              <ArrowLeft className="pacssd-w-4 pacssd-h-4 pacssd-mr-2" />
              Back to Search
            </button>
          </div>
          <div className="pacssd-header-center">
            <h1 className="pacssd-text-2xl pacssd-font-bold pacssd-text-white">PACS Server</h1>
          </div>
          <div className="pacssd-header-right">
            <div className="pacssd-user-controls">
              <button
                className="pacssd-user-initial-btn"
                disabled={loading}
              >
                {getUserInitial()}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pacssd-min-h-screen pacssd-bg-gray-100">
        <div className="pacssd-pacs-container">
          <div className="pacssd-study-details-section pacssd-fade-in">
            <div className="pacssd-search-header">
              <FileText size={28} />
              <h2>Study Details</h2>
            </div>

            {study ? (
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
                {loading ? 'Exporting...' : 'Export Entire Study'}
              </button>
            </div>
          </div>

          {study && (
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
                    key={series._id}
                    className={`pacssd-series-card ${selectedSeries?._id === series._id ? 'pacssd-selected' : ''}`}
                  >
                    <div className="pacssd-series-header">
                      <h4 className="pacssd-series-number">Series {series.seriesNumber || 'N/A'}</h4>
                      <span className="pacssd-series-modality">{series.modality}</span>
                    </div>

                    <div className="pacssd-series-description">{series.seriesDescription || 'No Description'}</div>
                    <div className="pacssd-series-meta">{series.instances?.length || 0} images</div>

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
                        {loading ? 'Exporting...' : 'Download'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedSeries && (
            <div className="pacssd-selected-series-info pacssd-fade-in">
              <h4>Selected Series: {selectedSeries.seriesDescription || 'No Description'}</h4>
              <p>Series {selectedSeries.seriesNumber || 'N/A'} - {selectedSeries.instances?.length || 0} images</p>
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