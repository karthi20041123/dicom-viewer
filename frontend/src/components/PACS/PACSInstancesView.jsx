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
import JSZip from 'jszip';
import { saveAs } from 'file-saver';


const PACSInstancesView = ({ selectedSeries, selectedStudy, onBackToDetails, onViewInstance }) => {
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

  const loadInstancesMetadata = async () => {
    setLoading(true);
    const metadata = {};
    
    for (const instance of selectedSeries.instances) {
      try {
        if (instance.file) {
          const arrayBuffer = await instance.file.arrayBuffer();
          const dicomData = new Uint8Array(arrayBuffer);
          
          // Basic metadata extraction (you can extend this)
          metadata[instance.sopUID] = {
            fileSize: instance.file.size,
            fileName: instance.file.name,
            instanceNumber: instance.instanceNum || 'Unknown',
            sopUID: instance.sopUID,
            acquisitionTime: instance.acquisitionTime || 'Unknown',
            imagePosition: instance.imagePosition || 'Unknown',
            imageOrientation: instance.imageOrientation || 'Unknown',
            pixelSpacing: instance.pixelSpacing || 'Unknown',
            sliceThickness: instance.sliceThickness || 'Unknown',
          };
        }
      } catch (error) {
        console.error(`Error loading metadata for instance ${instance.sopUID}:`, error);
        metadata[instance.sopUID] = {
          fileSize: instance.file?.size || 0,
          fileName: instance.file?.name || 'Unknown',
          instanceNumber: instance.instanceNum || 'Unknown',
          sopUID: instance.sopUID,
          error: 'Failed to load metadata'
        };
      }
    }
    
    setInstanceMetadata(metadata);
    setLoading(false);
  };

  const handleInstanceSelect = (instance) => {
    setSelectedInstances(prev => {
      const isSelected = prev.find(i => i.sopUID === instance.sopUID);
      if (isSelected) {
        return prev.filter(i => i.sopUID !== instance.sopUID);
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
    if (!instance.file) return;
    
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
      
      // Use wadouri instead of dicomweb for file loading
      const imageId = `wadouri:${URL.createObjectURL(instance.file)}`;
      const image = await cornerstone.loadAndCacheImage(imageId);
      
      if (image) {
        // Display the image
        cornerstone.displayImage(element, image);
        
        // Apply proper viewport settings
        const viewport = cornerstone.getDefaultViewportForImage(element, image);
        cornerstone.setViewport(element, viewport);
        
        // Force update to ensure rendering
        cornerstone.updateImage(element);
        
        // Wait a bit for rendering to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const canvas = element.querySelector('canvas');
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          try {
            const thumbnailData = canvas.toDataURL('image/jpeg', 0.8);
            
            // Verify the image data is not empty
            if (thumbnailData && thumbnailData !== 'data:,') {
              setPreviewInstance({
                ...instance,
                thumbnailData
              });
            } else {
              console.warn('Generated empty thumbnail data');
              alert('Could not generate preview - image may be corrupted or unsupported format');
            }
          } catch (canvasError) {
            console.error('Canvas toDataURL error:', canvasError);
            alert('Could not generate preview - canvas error');
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
      onViewInstance([instance.file]);
    }
  };

  const handleDownloadInstances = async (instances = selectedInstances) => {
    if (!instances.length) {
      alert('No instances selected for download!');
      return;
    }

    const format = prompt('Select format (jpg/png/dcm):', 'dcm');
    if (!format || !['jpg', 'png', 'dcm'].includes(format.toLowerCase())) {
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

    try {
      cornerstone.enable(element);

      for (const instance of instances) {
        try {
          const file = instance.file;
          
          if (format.toLowerCase() === 'dcm') {
            const buffer = await file.arrayBuffer();
            const fileName = file.name || `instance_${instance.instanceNum}.dcm`;
            zip.file(fileName, buffer);
          } else {
            const imageId = `wadouri:${URL.createObjectURL(file)}`;
            const image = await cornerstone.loadAndCacheImage(imageId);
            
            if (image) {
              cornerstone.displayImage(element, image);
              const canvas = element.querySelector('canvas');
              
              if (canvas) {
                const mimeType = format.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
                const quality = format.toLowerCase() === 'jpg' ? 0.9 : undefined;
                const fileData = canvas.toDataURL(mimeType, quality).split(',')[1];
                const fileName = file.name.replace(/\.[^/.]+$/, '') + `_${instance.instanceNum}.${format.toLowerCase()}`;
                zip.file(fileName, fileData, { base64: true });
              }
            } else {
              // Fallback to original DICOM file
              const buffer = await file.arrayBuffer();
              const fileName = file.name || `instance_${instance.instanceNum}.dcm`;
              zip.file(fileName, buffer);
            }
          }
        } catch (error) {
          console.error(`Error processing instance ${instance.sopUID}:`, error);
          // Fallback: add original file
          try {
            const buffer = await instance.file.arrayBuffer();
            const fileName = instance.file.name || `instance_${instance.instanceNum}.dcm`;
            zip.file(fileName, buffer);
          } catch (fallbackError) {
            console.error(`Fallback error for ${instance.sopUID}:`, fallbackError);
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
              const metadata = instanceMetadata[instance.sopUID] || {};
              const isSelected = selectedInstances.find(i => i.sopUID === instance.sopUID);
              
              return (
                <div 
                  key={instance.sopUID} 
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
                      <strong>SOP UID:</strong> {instance.sopUID.substring(0, 20)}...
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