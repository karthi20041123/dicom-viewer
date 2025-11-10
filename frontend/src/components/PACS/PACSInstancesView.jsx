import React, { useState, useEffect } from 'react';
import {
  Calendar,
  User,
  FileText,
  Eye,
  Download,
  ArrowLeft,
  Image,
  Info,
  Hash,
  Clock,
} from 'lucide-react';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import * as dicomParser from 'dicom-parser';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './PACSInstancesView.css';

const PACSInstancesView = ({ selectedSeries, selectedStudy, onBackToDetails, onViewInstance, backendUrl }) => {
  const [selectedInstances, setSelectedInstances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewInstance, setPreviewInstance] = useState(null);
  const [instanceMetadata, setInstanceMetadata] = useState({});
  const [selectAll, setSelectAll] = useState(false);

  // Load instance metadata when component mounts or series changes
  useEffect(() => {
    if (selectedSeries?.instances) {
      loadInstancesMetadata();
    }
  }, [selectedSeries]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadInstancesMetadata = async () => {
    setLoading(true);
    const metadata = {};
    const headers = getAuthHeaders();

    for (const instance of selectedSeries.instances) {
      try {
        const url = `${backendUrl}${instance.filePath}`;
        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`Failed to fetch DICOM file: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const byteArray = new Uint8Array(arrayBuffer);
        const dataSet = dicomParser.parseDicom(byteArray);

        metadata[instance.sopInstanceUID] = {
          fileSize: arrayBuffer.byteLength,
          fileName: instance.filename || instance.filePath.split('/').pop(),
          instanceNumber: dataSet.string('x00200013') || instance.instanceNumber || 'Unknown',
          sopInstanceUID: dataSet.string('x00080018') || instance.sopInstanceUID,
          acquisitionTime: dataSet.string('x00080032') || 'Unknown',
          imagePosition: dataSet.string('x00200032') || 'Unknown',
          imageOrientation: dataSet.string('x00200037') || 'Unknown',
          pixelSpacing: dataSet.string('x00280030') || 'Unknown',
          sliceThickness: dataSet.string('x00180050') || 'Unknown',
        };
      } catch (error) {
        console.error(`Error loading metadata for instance ${instance.sopInstanceUID}:`, error);
        metadata[instance.sopInstanceUID] = {
          fileSize: 0,
          fileName: instance.filename || instance.filePath.split('/').pop() || 'Unknown',
          instanceNumber: instance.instanceNumber || 'Unknown',
          sopInstanceUID: instance.sopInstanceUID,
          error: 'Failed to load metadata'
        };
      }
    }

    setInstanceMetadata(metadata);
    setLoading(false);
  };

  const handleInstanceSelect = (instance) => {
    setSelectedInstances(prev => {
      const isSelected = prev.find(i => i.sopInstanceUID === instance.sopInstanceUID);
      if (isSelected) {
        return prev.filter(i => i.sopInstanceUID !== instance.sopInstanceUID);
      } else {
        return [...prev, instance];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedInstances([]);
    } else {
      setSelectedInstances([...selectedSeries.instances]);
    }
    setSelectAll(!selectAll);
  };

  const handleInstancePreview = async (instance) => {
    setLoading(true);
    const element = document.createElement('div');
    element.style.width = '512px';
    element.style.height = '512px';
    element.style.position = 'absolute';
    element.style.top = '-9999px';
    element.style.left = '-9999px';
    element.style.visibility = 'hidden';
    document.body.appendChild(element);

    try {
      cornerstone.enable(element);
      
      const imageId = `wadouri:${backendUrl}${instance.filePath}`;
      const image = await cornerstone.loadAndCacheImage(imageId);
      
      if (image) {
        cornerstone.displayImage(element, image);
        const viewport = cornerstone.getDefaultViewportForImage(element, image);
        cornerstone.setViewport(element, viewport);
        cornerstone.updateImage(element);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const canvas = element.querySelector('canvas');
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          const thumbnailData = canvas.toDataURL('image/jpeg', 0.8);
          
          if (thumbnailData && thumbnailData !== 'data:,') {
            setPreviewInstance({
              ...instance,
              thumbnailData
            });
          } else {
            console.warn('Generated empty thumbnail data');
            alert('Could not generate preview - image may be corrupted or unsupported format');
          }
        } else {
          console.warn('Canvas not found or has invalid dimensions');
          alert('Could not generate preview - rendering failed');
        }
      } else {
        console.warn('Failed to load DICOM image');
        alert('Could not load DICOM image for preview');
      }
      
      cornerstone.disable(element);
    } catch (error) {
      console.error('Error generating preview:', error);
      alert(`Preview error: ${error.message || 'Unknown error'}`);
    } finally {
      if (document.body.contains(element)) {
        document.body.removeChild(element);
      }
      setLoading(false);
    }
  };

  const handleViewInstance = (instance) => {
    if (onViewInstance) {
      onViewInstance([`wadouri:${backendUrl}${instance.filePath}`]);
    }
  };

  const handleDownloadInstances = async (instances = selectedInstances) => {
    if (!instances.length) {
      alert('No instances selected for download!');
      return;
    }

    const format = prompt('Select format (jpg/png/dcm):', 'dcm').toLowerCase();
    if (!['jpg', 'png', 'dcm'].includes(format)) {
      alert('Invalid format! Please choose jpg, png, or dcm.');
      return;
    }

    setLoading(true);
    const zip = new JSZip();
    const element = document.createElement('div');
    element.style.width = '512px';
    element.style.height = '512px';
    element.style.position = 'absolute';
    element.style.top = '-9999px';
    document.body.appendChild(element);
    const headers = getAuthHeaders();

    try {
      cornerstone.enable(element);

      for (const instance of instances) {
        try {
          const url = `${backendUrl}${instance.filePath}`;
          const imageId = `wadouri:${url}`;
          
          if (format === 'dcm') {
            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const buffer = await response.arrayBuffer();
            const fileName = instance.filename || `instance_${instance.instanceNumber}.dcm`;
            zip.file(fileName, buffer);
          } else {
            const image = await cornerstone.loadAndCacheImage(imageId);
            
            if (image) {
              cornerstone.displayImage(element, image);
              const canvas = element.querySelector('canvas');
              
              if (canvas) {
                const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
                const quality = format === 'jpg' ? 0.9 : undefined;
                const fileData = canvas.toDataURL(mimeType, quality).split(',')[1];
                const fileName = (instance.filename || 'instance').replace(/\.[^/.]+$/, '') + `_${instance.instanceNumber}.${format}`;
                zip.file(fileName, fileData, { base64: true });
              }
            } else {
              // Fallback to original DICOM
              const response = await fetch(url, { headers });
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              const buffer = await response.arrayBuffer();
              const fileName = instance.filename || `instance_${instance.instanceNumber}.dcm`;
              zip.file(fileName, buffer);
            }
          }
        } catch (error) {
          console.error(`Error processing instance ${instance.sopInstanceUID}:`, error);
          try {
            const url = `${backendUrl}${instance.filePath}`;
            const response = await fetch(url, { headers });
            if (response.ok) {
              const buffer = await response.arrayBuffer();
              const fileName = instance.filename || `instance_${instance.instanceNumber}.dcm`;
              zip.file(fileName, buffer);
            }
          } catch (fallbackError) {
            console.error(`Fallback error for ${instance.sopInstanceUID}:`, fallbackError);
          }
        }
      }

      cornerstone.disable(element);
    } catch (error) {
      console.error('Error during download process:', error);
    } finally {
      document.body.removeChild(element);
      setLoading(false);
    }

    if (Object.keys(zip.files).length > 0) {
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(
        zipBlob,
        `instances_series_${selectedSeries.seriesNumber}_${new Date().toISOString().split('T')[0]}.zip`
      );
    } else {
      alert('No files were processed for download.');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!selectedSeries) {
    return (
      <div className="pacs-no-series-container">
        <div className="pacs-no-series-inner">
          <h2 className="pacs-no-series-title">No Series Selected</h2>
          <p className="pacs-no-series-text">Please select a series to view instances.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pacs-main-wrapper">
      <div className="pacs-header-bar">
        <div className="pacs-header-content">
          <button 
            onClick={onBackToDetails} 
            className="pacs-header-back-btn"
            disabled={loading}
          >
            <ArrowLeft className="pacs-back-icon" />
            Back
          </button>
          <h1 className="pacs-header-title">PACS Server - Instance Viewer</h1>
          <div></div> {/* Spacer for centering title if needed */}
        </div>
      </div>

      <div className="pacs-inner-container">
        <div className="pacs-study-details fade-in">
          <div className="pacs-search-header">
            <Image size={28} />
            <h2>Series Instances</h2>
          </div>

          <div className="pacs-info-grid">
            <div className="pacs-info-section">
              <h3>
                <User className="pacs-info-icon" />
                Patient Information
              </h3>
              <div className="pacs-info-item">
                <span className="pacs-info-label">Name:</span>
                <span className="pacs-info-value">{selectedStudy?.patientName || 'Unknown'}</span>
              </div>
              <div className="pacs-info-item">
                <span className="pacs-info-label">Patient ID:</span>
                <span className="pacs-info-value">{selectedStudy?.patientID || 'Unknown'}</span>
              </div>
            </div>

            <div className="pacs-info-section">
              <h3>
                <FileText className="pacs-info-icon" />
                Series Information
              </h3>
              <div className="pacs-info-item">
                <span className="pacs-info-label">Series Number:</span>
                <span className="pacs-info-value">{selectedSeries.seriesNumber}</span>
              </div>
              <div className="pacs-info-item">
                <span className="pacs-info-label">Description:</span>
                <span className="pacs-info-value">{selectedSeries.seriesDescription}</span>
              </div>
              <div className="pacs-info-item">
                <span className="pacs-info-label">Modality:</span>
                <span className="pacs-info-value">{selectedSeries.modality}</span>
              </div>
              <div className="pacs-info-item">
                <span className="pacs-info-label">Instances:</span>
                <span className="pacs-info-value">{selectedSeries.numberOfInstances}</span>
              </div>
            </div>
          </div>

          {/* Bulk actions */}
          <div className="pacs-bulk-actions">
            <div className="pacs-select-group">
              <label className="pacs-select-label">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  className="pacs-select-checkbox"
                />
                Select All ({selectedSeries.instances.length})
              </label>
              {selectedInstances.length > 0 && (
                <span className="pacs-selected-count">
                  {selectedInstances.length} selected
                </span>
              )}
            </div>
            
            <div className="pacs-download-group">
              <button
                onClick={() => handleDownloadInstances()}
                disabled={loading || selectedInstances.length === 0}
                className="pacs-download-selected-btn"
              >
                <Download className="pacs-download-icon" />
                Download Selected ({selectedInstances.length})
              </button>
            </div>
          </div>
        </div>

        <div className="pacs-results-section scale-in">
          <div className="pacs-results-header">
            <h3>
              Instance Collection
              <span className="pacs-results-count">{selectedSeries.instances.length}</span>
            </h3>
          </div>

          <div className="pacs-instances-grid">
            {selectedSeries.instances.map((instance, index) => {
              const metadata = instanceMetadata[instance.sopInstanceUID] || {};
              const isSelected = selectedInstances.find(i => i.sopInstanceUID === instance.sopInstanceUID);
              
              return (
                <div 
                  key={instance.sopInstanceUID} 
                  className={`pacs-instance-card ${isSelected ? 'pacs-selected-card' : ''}`}
                >
                  <div className="pacs-instance-header">
                    <h4 className="pacs-instance-number">
                      Instance {metadata.instanceNumber || index + 1}
                    </h4>
                    <input
                      type="checkbox"
                      checked={!!isSelected}
                      onChange={() => handleInstanceSelect(instance)}
                      className="pacs-instance-checkbox"
                    />
                  </div>

                  <div className="pacs-instance-metadata">
                    <div className="pacs-metadata-row">
                      <Hash className="pacs-metadata-icon" />
                      <strong>SOP UID:</strong> {instance.sopInstanceUID?.substring(0, 20)}...
                    </div>
                    <div className="pacs-metadata-row">
                      <FileText className="pacs-metadata-icon" />
                      <strong>File:</strong> {metadata.fileName}
                    </div>
                    <div className="pacs-metadata-row">
                      <Info className="pacs-metadata-icon" />
                      <strong>Size:</strong> {formatFileSize(metadata.fileSize)}
                    </div>
                    {metadata.acquisitionTime && metadata.acquisitionTime !== 'Unknown' && (
                      <div className="pacs-metadata-row">
                        <Clock className="pacs-metadata-icon" />
                        <strong>Acquisition:</strong> {metadata.acquisitionTime}
                      </div>
                    )}
                  </div>

                  <div className="pacs-instance-actions">
                    <button 
                      onClick={() => handleViewInstance(instance)} 
                      className="pacs-instance-view-btn"
                      disabled={loading}
                    >
                      <Eye className="pacs-action-icon" />
                      View
                    </button>
                    <button
                      onClick={() => handleInstancePreview(instance)}
                      className="pacs-instance-preview-btn"
                      disabled={loading}
                    >
                      <Image className="pacs-action-icon" />
                      Preview
                    </button>
                    <button
                      onClick={() => handleDownloadInstances([instance])}
                      className="pacs-instance-download-btn"
                      disabled={loading}
                    >
                      <Download className="pacs-action-icon" />
                      Download
                    </button>
                  </div>

                  {/* {metadata.error && (
                    <div className="pacs-error-message">
                      {metadata.error}
                    </div>
                  )} */}
                </div>
              );
            })}
          </div>
        </div>

        {/* Preview Modal */}
        {previewInstance && (
          <div className="pacs-preview-modal">
            <div className="pacs-preview-content">
              <div className="pacs-preview-header">
                <h3>Instance Preview</h3>
                <button 
                  onClick={() => setPreviewInstance(null)}
                  className="pacs-close-btn"
                >
                  Close
                </button>
              </div>
              {previewInstance.thumbnailData && (
                <img 
                  src={previewInstance.thumbnailData} 
                  alt="Instance Preview"
                  className="pacs-preview-image"
                />
              )}
            </div>
          </div>
        )}

        {loading && (
          <div className="pacs-loading-overlay">
            <div className="pacs-loading-spinner">
              <div className="pacs-spinner"></div>
              <p>Processing...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PACSInstancesView;