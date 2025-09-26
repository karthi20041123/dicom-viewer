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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-700 mb-4">No Series Selected</h2>
          <p className="text-gray-500">Please select a series to view instances.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-blue-600 text-white p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">PACS Server - Instance Viewer</h1>
        </div>
      </div>

      <div className="pacs-container">
        <button 
          onClick={onBackToDetails} 
          className="back-button"
          disabled={loading}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Study Details
        </button>

        <div className="study-details-section fade-in">
          <div className="search-header">
            <Image size={28} />
            <h2>Series Instances</h2>
          </div>

          <div className="study-info-grid">
            <div className="info-section">
              <h3>
                <User className="w-5 h-5" />
                Patient Information
              </h3>
              <div className="info-item">
                <span className="info-label">Name:</span>
                <span className="info-value">{selectedStudy?.patientName || 'Unknown'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Patient ID:</span>
                <span className="info-value">{selectedStudy?.patientID || 'Unknown'}</span>
              </div>
            </div>

            <div className="info-section">
              <h3>
                <FileText className="w-5 h-5" />
                Series Information
              </h3>
              <div className="info-item">
                <span className="info-label">Series Number:</span>
                <span className="info-value">{selectedSeries.seriesNumber}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Description:</span>
                <span className="info-value">{selectedSeries.seriesDescription}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Modality:</span>
                <span className="info-value">{selectedSeries.modality}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Instances:</span>
                <span className="info-value">{selectedSeries.numberOfInstances}</span>
              </div>
            </div>
          </div>

          {/* Bulk actions */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  className="mr-2"
                />
                Select All ({selectedSeries.instances.length})
              </label>
              {selectedInstances.length > 0 && (
                <span className="text-sm text-gray-600">
                  {selectedInstances.length} selected
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => handleDownloadInstances()}
                disabled={loading || selectedInstances.length === 0}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
              >
                <Download className="mr-2 w-4 h-4" />
                Download Selected ({selectedInstances.length})
              </button>
            </div>
          </div>
        </div>

        <div className="results-section scale-in">
          <div className="results-header">
            <h3>
              Instance Collection
              <span className="results-count">{selectedSeries.instances.length}</span>
            </h3>
          </div>

          <div className="instances-grid" style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '16px',
            marginTop: '16px'
          }}>
            {selectedSeries.instances.map((instance, index) => {
              const metadata = instanceMetadata[instance.sopInstanceUID] || {};
              const isSelected = selectedInstances.find(i => i.sopInstanceUID === instance.sopInstanceUID);
              
              return (
                <div 
                  key={instance.sopInstanceUID} 
                  className={`instance-card ${isSelected ? 'selected' : ''}`}
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: isSelected ? '#e3f2fd' : 'white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div className="instance-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 className="instance-number" style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
                      Instance {metadata.instanceNumber || index + 1}
                    </h4>
                    <input
                      type="checkbox"
                      checked={!!isSelected}
                      onChange={() => handleInstanceSelect(instance)}
                      style={{ width: '18px', height: '18px' }}
                    />
                  </div>

                  <div className="instance-metadata" style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
                    <div style={{ marginBottom: '4px' }}>
                      <Hash className="w-4 h-4" style={{ display: 'inline', marginRight: '4px' }} />
                      <strong>SOP UID:</strong> {instance.sopInstanceUID?.substring(0, 20)}...
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      <FileText className="w-4 h-4" style={{ display: 'inline', marginRight: '4px' }} />
                      <strong>File:</strong> {metadata.fileName}
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      <Info className="w-4 h-4" style={{ display: 'inline', marginRight: '4px' }} />
                      <strong>Size:</strong> {formatFileSize(metadata.fileSize)}
                    </div>
                    {metadata.acquisitionTime && metadata.acquisitionTime !== 'Unknown' && (
                      <div style={{ marginBottom: '4px' }}>
                        <Clock className="w-4 h-4" style={{ display: 'inline', marginRight: '4px' }} />
                        <strong>Acquisition:</strong> {metadata.acquisitionTime}
                      </div>
                    )}
                  </div>

                  <div className="instance-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button 
                      onClick={() => handleViewInstance(instance)} 
                      className="instance-view-btn"
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#1a237e',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '12px'
                      }}
                      disabled={loading}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </button>
                    <button
                      onClick={() => handleInstancePreview(instance)}
                      className="instance-preview-btn"
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#1a237e',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '12px'
                      }}
                      disabled={loading}
                    >
                      <Image className="w-4 h-4 mr-1" />
                      Preview
                    </button>
                    <button
                      onClick={() => handleDownloadInstances([instance])}
                      className="instance-download-btn"
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#008b3fff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '12px'
                      }}
                      disabled={loading}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </button>
                  </div>

                  {metadata.error && (
                    <div style={{ marginTop: '8px', padding: '4px 8px', backgroundColor: '#ffebee', color: '#c62828', fontSize: '12px', borderRadius: '4px' }}>
                      {metadata.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Preview Modal */}
        {previewInstance && (
          <div className="preview-modal" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              maxWidth: '80%',
              maxHeight: '80%',
              overflow: 'auto'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3>Instance Preview</h3>
                <button 
                  onClick={() => setPreviewInstance(null)}
                  style={{ 
                    backgroundColor: '#f44336', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    padding: '8px 16px',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
              {previewInstance.thumbnailData && (
                <img 
                  src={previewInstance.thumbnailData} 
                  alt="Instance Preview"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              )}
            </div>
          </div>
        )}

        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Processing...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PACSInstancesView;