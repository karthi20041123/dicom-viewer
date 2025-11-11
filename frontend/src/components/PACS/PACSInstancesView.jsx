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
  X,
} from 'lucide-react';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import * as dicomParser from 'dicom-parser';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './PACSInstancesView.css';

const PACSInstancesView = ({
  selectedSeries,
  selectedStudy,
  onBackToDetails,
  onViewInstance,
  backendUrl,
}) => {
  /* --------------------------------------------------------------
     State
  -------------------------------------------------------------- */
  const [selectedInstances, setSelectedInstances] = useState([]); // checked instances
  const [loading, setLoading] = useState(false);
  const [previewInstance, setPreviewInstance] = useState(null);
  const [instanceMetadata, setInstanceMetadata] = useState({});
  const [selectAll, setSelectAll] = useState(false);
  const [showFormatDialog, setShowFormatDialog] = useState(false);
  const [pendingDownloadInstances, setPendingDownloadInstances] = useState([]);
  const [downloadFormat, setDownloadFormat] = useState('dcm');

  /* --------------------------------------------------------------
     Load metadata for every instance in the series
  -------------------------------------------------------------- */
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
        if (!instance.file) {
          console.warn(`No file for instance ${instance.sopInstanceUID}`);
          continue;
        }
        const arrayBuffer = await instance.file.arrayBuffer();
        const byteArray = new Uint8Array(arrayBuffer);
        const dataSet = dicomParser.parseDicom(byteArray);

        metadata[instance.sopInstanceUID] = {
          fileSize: arrayBuffer.byteLength,
          fileName: instance.filename || instance.file.name || 'Unknown',
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
          fileSize: instance.file?.size || 0,
          fileName: instance.filename || instance.file?.name || 'Unknown',
          instanceNumber: instance.instanceNumber || 'Unknown',
          sopInstanceUID: instance.sopInstanceUID,
          error: 'Failed to load metadata',
        };
      }
    }

    setInstanceMetadata(metadata);
    setLoading(false);
  };

  /* --------------------------------------------------------------
     Selection handling
  -------------------------------------------------------------- */
  const handleInstanceSelect = (instance) => {
    setSelectedInstances((prev) => {
      const already = prev.some((i) => i.sopInstanceUID === instance.sopInstanceUID);
      if (already) {
        return prev.filter((i) => i.sopInstanceUID !== instance.sopInstanceUID);
      }
      return [...prev, instance];
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

  // Sync "Select All" checkbox
  useEffect(() => {
    const total = selectedSeries.instances?.length || 0;
    const selected = selectedInstances.length;
    setSelectAll(selected === total && total > 0);
  }, [selectedInstances, selectedSeries.instances]);

  /* --------------------------------------------------------------
     Preview (thumbnail)
  -------------------------------------------------------------- */
  const handleInstancePreview = async (instance) => {
    if (!instance.file) {
      alert('No file available for preview');
      return;
    }

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
      const blobUrl = URL.createObjectURL(instance.file);
      const imageId = `wadouri:${blobUrl}`;
      const image = await cornerstone.loadAndCacheImage(imageId);

      if (image) {
        cornerstone.displayImage(element, image);
        const viewport = cornerstone.getDefaultViewportForImage(element, image);
        cornerstone.setViewport(element, viewport);
        cornerstone.updateImage(element);

        await new Promise((r) => setTimeout(r, 100));

        const canvas = element.querySelector('canvas');
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          const thumbnailData = canvas.toDataURL('image/jpeg', 0.8);
          if (thumbnailData && thumbnailData !== 'data:,') {
            setPreviewInstance({ ...instance, thumbnailData });
          } else {
            alert('Could not generate preview – image may be corrupted');
          }
        } else {
          alert('Could not generate preview – rendering failed');
        }
      } else {
        alert('Could not load DICOM image for preview');
      }

      cornerstone.disable(element);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Preview error:', err);
      alert(`Preview error: ${err.message || 'Unknown error'}`);
    } finally {
      if (document.body.contains(element)) document.body.removeChild(element);
      setLoading(false);
    }
  };

  /* --------------------------------------------------------------
     View (full-screen viewer)
  -------------------------------------------------------------- */
  const handleViewInstance = (instance) => {
    if (!instance.file) {
      alert('No file available to view');
      return;
    }
    if (onViewInstance) {
      const blobUrl = URL.createObjectURL(instance.file);
      onViewInstance([`wadouri:${blobUrl}`]);
    }
  };

  /* --------------------------------------------------------------
     Download helpers
  -------------------------------------------------------------- */
  const openDownloadDialog = (instances) => {
    if (!instances?.length) {
      alert('No instances to download!');
      return;
    }
    setPendingDownloadInstances(instances);
    setDownloadFormat('dcm');
    setShowFormatDialog(true);
  };

  const confirmDownload = async () => {
    if (!pendingDownloadInstances.length) return;
    setShowFormatDialog(false);
    await handleDownloadInstances(pendingDownloadInstances, downloadFormat);
  };

  const handleDownloadInstances = async (instances = selectedInstances, format = 'dcm') => {
    if (!instances.length) {
      alert('No instances selected for download!');
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
        if (!instance.file) {
          console.warn(`No file for instance ${instance.sopInstanceUID}`);
          continue;
        }

        const blobUrl = URL.createObjectURL(instance.file);
        const imageId = `wadouri:${blobUrl}`;

        if (format === 'dcm') {
          const fileName =
            instance.filename || instance.file.name || `instance_${instance.instanceNumber || ''}.dcm`;
          zip.file(fileName, instance.file);
        } else {
          try {
            const image = await cornerstone.loadAndCacheImage(imageId);
            if (image) {
              cornerstone.displayImage(element, image);
              await new Promise((r) => setTimeout(r, 50));

              const canvas = element.querySelector('canvas');
              if (canvas) {
                const blob = await new Promise((resolve) => {
                  canvas.toBlob(
                    resolve,
                    format === 'png' ? 'image/png' : 'image/jpeg',
                    0.9
                  );
                });
                const baseName = (instance.filename || instance.file.name || 'instance').replace(/\.[^/.]+$/, '');
                const fileName = `${baseName}_${instance.instanceNumber || ''}.${format}`;
                if (blob) zip.file(fileName, blob);
              }
            } else {
              const fileName =
                instance.filename || instance.file.name || `instance_${instance.instanceNumber || ''}.dcm`;
              zip.file(fileName, instance.file);
            }
          } catch (e) {
            console.error(`Render error for ${instance.sopInstanceUID}:`, e);
            const fileName =
              instance.filename || instance.file.name || `instance_${instance.instanceNumber || ''}.dcm`;
            zip.file(fileName, instance.file);
          }
        }
        URL.revokeObjectURL(blobUrl);
      }

      cornerstone.disable(element);
    } catch (err) {
      console.error('Download process error:', err);
      alert('An error occurred during download. Check console for details.');
    } finally {
      if (document.body.contains(element)) document.body.removeChild(element);
      setLoading(false);
    }

    if (Object.keys(zip.files).length > 0) {
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const suffix =
        instances.length === 1
          ? `_${instances[0].instanceNumber || ''}`
          : `_series_${selectedSeries.seriesNumber}`;
      saveAs(zipBlob, `instances${suffix}_${new Date().toISOString().split('T')[0]}.zip`);
      alert(`Successfully downloaded ${Object.keys(zip.files).length} file(s)!`);
    } else {
      alert('No files were processed for download.');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  /* --------------------------------------------------------------
     Render
  -------------------------------------------------------------- */
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

  const instances = selectedSeries.instances || [];

  return (
    <div className="pacs-main-wrapper">
      {/* Header */}
      <div className="pacs-header-bar">
        <div className="pacs-header-content">
          <button onClick={onBackToDetails} className="pacs-header-back-btn" disabled={loading}>
            <ArrowLeft className="pacs-back-icon" />
            Back
          </button>
          <h1 className="pacs-header-title">PACS Server - Instance Viewer</h1>
          <div />
        </div>
      </div>

      <div className="pacs-inner-container">
        {/* Study / Series info */}
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
                <span className="pacs-info-value">
                  {selectedSeries.numberOfInstances || instances.length}
                </span>
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
                Select All ({instances.length})
              </label>
              {selectedInstances.length > 0 && (
                <span className="pacs-selected-count">{selectedInstances.length} selected</span>
              )}
            </div>

            <div className="pacs-download-group">
              <button
                onClick={() => openDownloadDialog(selectedInstances)}
                disabled={loading || selectedInstances.length === 0}
                className="pacs-download-selected-btn"
              >
                <Download className="pacs-download-icon" />
                {loading ? 'Downloading...' : `Download Selected (${selectedInstances.length})`}
              </button>
            </div>
          </div>
        </div>

        {/* Instances grid */}
        <div className="pacs-results-section scale-in">
          <div className="pacs-results-header">
            <h3>
              Instance Collection
              <span className="pacs-results-count">{instances.length}</span>
            </h3>
          </div>

          <div className="pacs-instances-grid">
            {instances.map((instance, idx) => {
              const meta = instanceMetadata[instance.sopInstanceUID] || {};
              const isSelected = selectedInstances.some(
                (i) => i.sopInstanceUID === instance.sopInstanceUID
              );

              return (
                <div
                  key={instance.sopInstanceUID}
                  className={`pacs-instance-card ${isSelected ? 'pacs-selected-card' : ''}`}
                  onClick={() => handleInstanceSelect(instance)}
                >
                  <div className="pacs-instance-header">
                    <h4 className="pacs-instance-number">
                      Instance {meta.instanceNumber || idx + 1}
                    </h4>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleInstanceSelect(instance)}
                      className="pacs-instance-checkbox"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  <div className="pacs-instance-metadata">
                    <div className="pacs-metadata-row">
                      <Hash className="pacs-metadata-icon" />
                      <strong>SOP UID:</strong> {instance.sopInstanceUID?.substring(0, 20)}...
                    </div>
                    <div className="pacs-metadata-row">
                      <FileText className="pacs-metadata-icon" />
                      <strong>File:</strong> {meta.fileName}
                    </div>
                    <div className="pacs-metadata-row">
                      <Info className="pacs-metadata-icon" />
                      <strong>Size:</strong> {formatFileSize(meta.fileSize)}
                    </div>
                    {meta.acquisitionTime && meta.acquisitionTime !== 'Unknown' && (
                      <div className="pacs-metadata-row">
                        <Clock className="pacs-metadata-icon" />
                        <strong>Acquisition:</strong> {meta.acquisitionTime}
                      </div>
                    )}
                  </div>

                  <div className="pacs-instance-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewInstance(instance);
                      }}
                      className="pacs-instance-view-btn"
                      disabled={loading}
                    >
                      <Eye className="pacs-action-icon" />
                      View
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInstancePreview(instance);
                      }}
                      className="pacs-instance-preview-btn"
                      disabled={loading}
                    >
                      <Image className="pacs-action-icon" />
                      Preview
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDownloadDialog([instance]);
                      }}
                      className="pacs-instance-download-btn"
                      disabled={loading}
                    >
                      <Download className="pacs-action-icon" />
                      Download
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Format dialog */}
        {showFormatDialog && (
          <div className="pacs-format-dialog-overlay">
            <div className="pacs-format-dialog">
              <div className="pacs-format-header">
                <h3>Select Download Format</h3>
                <button onClick={() => setShowFormatDialog(false)} className="pacs-close-btn">
                  <X size={20} />
                </button>
              </div>

              <div className="pacs-format-options">
                <label className="pacs-format-option">
                  <input
                    type="radio"
                    name="format"
                    value="dcm"
                    checked={downloadFormat === 'dcm'}
                    onChange={(e) => setDownloadFormat(e.target.value)}
                  />
                  <span>.dcm (Original DICOM)</span>
                </label>
                <label className="pacs-format-option">
                  <input
                    type="radio"
                    name="format"
                    value="png"
                    checked={downloadFormat === 'png'}
                    onChange={(e) => setDownloadFormat(e.target.value)}
                  />
                  <span>.png (Lossless Image)</span>
                </label>
                <label className="pacs-format-option">
                  <input
                    type="radio"
                    name="format"
                    value="jpg"
                    checked={downloadFormat === 'jpg'}
                    onChange={(e) => setDownloadFormat(e.target.value)}
                  />
                  <span>.jpg (Compressed Image)</span>
                </label>
              </div>

              <div className="pacs-format-actions">
                <button onClick={() => setShowFormatDialog(false)} className="pacs-cancel-btn">
                  Cancel
                </button>
                <button
                  onClick={confirmDownload}
                  className="pacs-confirm-btn"
                  disabled={loading}
                >
                  {loading ? 'Downloading...' : `Download ${pendingDownloadInstances.length} file(s)`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Preview modal */}
        {previewInstance && (
          <div className="pacs-preview-modal">
            <div className="pacs-preview-content">
              <div className="pacs-preview-header">
                <h3>Instance Preview</h3>
                <button onClick={() => setPreviewInstance(null)} className="pacs-close-btn">
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

        {/* Global loading overlay */}
        {loading && (
          <div className="pacs-loading-overlay">
            <div className="pacs-loading-spinner">
              <div className="pacs-spinner" />
              <p>Processing...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PACSInstancesView;