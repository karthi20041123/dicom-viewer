import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import {
  User,
  Upload,
  Save,
  ArrowLeft,
  Calendar,
  FileText,
  Activity,
  Hash,
  Phone,
  Mail,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import './AddStudyPage.css';

// API base URL
const API_BASE_URL = 'http://localhost:5000/api';

const AddStudyPage = ({ 
  onBack, 
  isLoggedIn, 
  existingStudy = null, 
  mode = 'create', // 'create' or 'edit'
  onStudySaved 
}) => {
  const navigate = useNavigate(); // Initialize useNavigate
  const [studyData, setStudyData] = useState({
    patientName: '',
    patientID: '',
    patientBirthDate: '',
    patientSex: '',
    patientPhone: '',
    patientEmail: '',
    patientAddress: '',
    studyID: '',
    studyDate: new Date().toISOString().split('T')[0],
    studyTime: new Date().toTimeString().split(' ')[0].slice(0, 5),
    studyDescription: '',
    modality: '',
    accessionNumber: '',
    bodyPartExamined: '',
    referringPhysician: '',
    studyPriority: 'routine',
    studyStatus: 'scheduled',
    comments: '',
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (existingStudy && mode === 'edit') {
      setStudyData(prev => ({
        ...prev,
        patientName: existingStudy.patientName || '',
        patientID: existingStudy.patientID || '',
        studyDate: existingStudy.studyDate ? new Date(existingStudy.studyDate).toISOString().split('T')[0] : '',
        studyTime: existingStudy.studyTime || '',
        studyDescription: existingStudy.studyDescription || '',
        modality: existingStudy.modality || '',
        accessionNumber: existingStudy.accessionNumber || '',
        studyID: existingStudy.studyID || '',
      }));
    }
  }, [existingStudy, mode]);

  const getAuthToken = () => {
    return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  };

  const apiRequest = async (endpoint, options = {}) => {
    const token = getAuthToken();
    const headers = {
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        throw new Error('Authentication expired. Please log in again.');
      }

      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      throw error;
    }
  };

  const handleInputChange = (field, value) => {
    setStudyData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const generateStudyID = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `STU${timestamp}${random}`;
  };

  const generateAccessionNumber = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `ACC${date}${random}`;
  };

  const handleSaveStudy = async () => {
    if (!isLoggedIn) {
      setMessage('Please log in to save study details');
      return;
    }

    if (!studyData.patientName.trim() || !studyData.patientID.trim()) {
      setMessage('Patient Name and Patient ID are required');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setLoading(true);
    try {
      const finalStudyData = {
        ...studyData,
        studyID: studyData.studyID || generateStudyID(),
        accessionNumber: studyData.accessionNumber || generateAccessionNumber(),
      };

      const endpoint = mode === 'edit' && existingStudy 
        ? `/dicom/study/${existingStudy.id}` 
        : '/dicom/study/create';
      
      const method = mode === 'edit' ? 'PUT' : 'POST';

      const response = await apiRequest(endpoint, {
        method,
        body: JSON.stringify(finalStudyData),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setMessage(`Study ${mode === 'edit' ? 'updated' : 'created'} successfully!`);
        setStudyData(finalStudyData);
        
        if (onStudySaved) {
          onStudySaved(data.study);
        }
        
        setTimeout(() => {
          setMessage('');
          if (mode === 'create') {
            setStudyData({
              patientName: '',
              patientID: '',
              patientBirthDate: '',
              patientSex: '',
              patientPhone: '',
              patientEmail: '',
              patientAddress: '',
              studyID: '',
              studyDate: new Date().toISOString().split('T')[0],
              studyTime: new Date().toTimeString().split(' ')[0].slice(0, 5),
              studyDescription: '',
              modality: '',
              accessionNumber: '',
              bodyPartExamined: '',
              referringPhysician: '',
              studyPriority: 'routine',
              studyStatus: 'scheduled',
              comments: '',
            });
          }
        }, 2000);
      } else {
        throw new Error(data.message || 'Failed to save study');
      }
    } catch (error) {
      console.error('Error saving study:', error);
      setMessage(`Error: ${error.message}`);
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadClick = () => {
    if (!isLoggedIn) {
      setMessage('Please log in to upload DICOM files');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    fileInputRef.current.click();
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) {
      setMessage('No files selected for upload');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    if (!isLoggedIn) {
      setMessage('Please log in to upload files');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    for (const file of files) {
      if (file.size > 100 * 1024 * 1024) {
        setMessage(`File ${file.name} exceeds 100MB limit`);
        setTimeout(() => setMessage(''), 3000);
        return;
      }
      if (!['.dcm', '.dicom'].includes(file.name.toLowerCase().slice(-4))) {
        setMessage(`File ${file.name} is not a valid DICOM file (.dcm or .dicom)`);
        setTimeout(() => setMessage(''), 3000);
        return;
      }
    }

    setIsUploading(true);
    setUploadProgress(0);
    setLoading(true);

    try {
      console.log('Uploading files:', files.map(f => ({ name: f.name, size: f.size })));
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('dicomFiles', file);
      });

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.min(10, 100 - prev);
        });
      }, 500);

      const response = await apiRequest('/dicom/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await response.json();
      console.log('Upload response:', data);

      if (response.ok && data.success) {
        let message = `Successfully uploaded ${data.uploadResults.length} files!`;
        if (data.errors && data.errors.length > 0) {
          message += ` Errors: ${data.errors.map(e => `${e.filename}: ${e.error}`).join('; ')}`;
        }
        setMessage(message);
      } else {
        throw new Error(data.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      let errorMessage = `Upload failed: ${error.message}`;
      if (error.message.includes('No files uploaded')) {
        errorMessage = 'No valid DICOM files were uploaded. Please select .dcm or .dicom files.';
      }
      setMessage(errorMessage);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // Handle back navigation
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/'); // Navigate to the root route where PACSSearchResults is rendered
    }
  };

  return (
    <div className="details-container">
      <div className="details-header">
        <button onClick={handleBack} className="back-btn">
          <ArrowLeft size={24} />
          Back to Studies
        </button>
        <h1 className="details-title">
          {mode === 'edit' ? 'Edit Study Details' : 'Add New Study'}
        </h1>
        <div className="header-actions">
          <button onClick={handleUploadClick} className="upload-btn" disabled={isUploading}>
            <Upload size={20} />
            {isUploading ? 'Uploading...' : 'Upload DICOM'}
          </button>
        </div>
      </div>

      {isUploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
          </div>
          <p>Uploading files... {uploadProgress}%</p>
        </div>
      )}

      {message && (
        <div className={`message-banner ${message.includes('Error') || message.includes('failed') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="details-content">
        <div className="details-grid">
          {/* Patient Information Section */}
          <div className="section-card">
            <div className="section-header">
              <User size={24} className="section-icon" />
              <h2 className="section-title">Patient Information</h2>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label className="field-label">Patient Name *</label>
                <input
                  type="text"
                  placeholder="Enter patient full name"
                  value={studyData.patientName}
                  onChange={(e) => handleInputChange('patientName', e.target.value)}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-field">
                <label className="field-label">Patient ID *</label>
                <input
                  type="text"
                  placeholder="Enter patient ID"
                  value={studyData.patientID}
                  onChange={(e) => handleInputChange('patientID', e.target.value)}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-field">
                <label className="field-label">Birth Date</label>
                <input
                  type="date"
                  value={studyData.patientBirthDate}
                  onChange={(e) => handleInputChange('patientBirthDate', e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-field">
                <label className="field-label">Gender</label>
                <select
                  value={studyData.patientSex}
                  onChange={(e) => handleInputChange('patientSex', e.target.value)}
                  className="form-input"
                >
                  <option value="">Select Gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
              <div className="form-field">
                <label className="field-label">Phone</label>
                <input
                  type="tel"
                  placeholder="Enter phone number"
                  value={studyData.patientPhone}
                  onChange={(e) => handleInputChange('patientPhone', e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-field">
                <label className="field-label">Email</label>
                <input
                  type="email"
                  placeholder="Enter email address"
                  value={studyData.patientEmail}
                  onChange={(e) => handleInputChange('patientEmail', e.target.value)}
                  className="form-input"
                />
              </div>
            </div>
            <div className="form-field full-width">
              <label className="field-label">Address</label>
              <textarea
                placeholder="Enter patient address"
                value={studyData.patientAddress}
                onChange={(e) => handleInputChange('patientAddress', e.target.value)}
                className="form-textarea"
                rows="2"
              />
            </div>
          </div>

          {/* Study Information Section */}
          <div className="section-card">
            <div className="section-header">
              <FileText size={24} className="section-icon" />
              <h2 className="section-title">Study Information</h2>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label className="field-label">Study ID</label>
                <div className="input-with-button">
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={studyData.studyID}
                    onChange={(e) => handleInputChange('studyID', e.target.value)}
                    className="form-input"
                  />
                  <button 
                    type="button" 
                    onClick={() => handleInputChange('studyID', generateStudyID())}
                    className="generate-btn"
                  >
                    <Hash size={16} />
                  </button>
                </div>
              </div>
              <div className="form-field">
                <label className="field-label">Accession Number</label>
                <div className="input-with-button">
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={studyData.accessionNumber}
                    onChange={(e) => handleInputChange('accessionNumber', e.target.value)}
                    className="form-input"
                  />
                  <button 
                    type="button" 
                    onClick={() => handleInputChange('accessionNumber', generateAccessionNumber())}
                    className="generate-btn"
                  >
                    <Hash size={16} />
                  </button>
                </div>
              </div>
              <div className="form-field">
                <label className="field-label">Study Date</label>
                <input
                  type="date"
                  value={studyData.studyDate}
                  onChange={(e) => handleInputChange('studyDate', e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-field">
                <label className="field-label">Study Time</label>
                <input
                  type="time"
                  value={studyData.studyTime}
                  onChange={(e) => handleInputChange('studyTime', e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-field">
                <label className="field-label">Modality</label>
                <select
                  value={studyData.modality}
                  onChange={(e) => handleInputChange('modality', e.target.value)}
                  className="form-input"
                >
                  <option value="">Select Modality</option>
                  <option value="CT">CT</option>
                  <option value="MR">MR</option>
                  <option value="XR">X-Ray</option>
                  <option value="US">Ultrasound</option>
                  <option value="NM">Nuclear Medicine</option>
                  <option value="PET">PET</option>
                  <option value="MG">Mammography</option>
                  <option value="CR">Computed Radiography</option>
                  <option value="DR">Digital Radiography</option>
                </select>
              </div>
              <div className="form-field">
                <label className="field-label">Body Part Examined</label>
                <input
                  type="text"
                  placeholder="e.g., Chest, Head, Abdomen"
                  value={studyData.bodyPartExamined}
                  onChange={(e) => handleInputChange('bodyPartExamined', e.target.value)}
                  className="form-input"
                />
              </div>
            </div>
            <div className="form-field full-width">
              <label className="field-label">Study Description</label>
              <textarea
                placeholder="Enter study description"
                value={studyData.studyDescription}
                onChange={(e) => handleInputChange('studyDescription', e.target.value)}
                className="form-textarea"
                rows="3"
              />
            </div>
          </div>

          {/* Additional Information Section */}
          <div className="section-card">
            <div className="section-header">
              <Activity size={24} className="section-icon" />
              <h2 className="section-title">Additional Information</h2>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label className="field-label">Referring Physician</label>
                <input
                  type="text"
                  placeholder="Enter referring physician name"
                  value={studyData.referringPhysician}
                  onChange={(e) => handleInputChange('referringPhysician', e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-field">
                <label className="field-label">Study Priority</label>
                <select
                  value={studyData.studyPriority}
                  onChange={(e) => handleInputChange('studyPriority', e.target.value)}
                  className="form-input"
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="emergent">Emergent</option>
                  <option value="stat">STAT</option>
                </select>
              </div>
              <div className="form-field">
                <label className="field-label">Study Status</label>
                <select
                  value={studyData.studyStatus}
                  onChange={(e) => handleInputChange('studyStatus', e.target.value)}
                  className="form-input"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="form-field full-width">
              <label className="field-label">Comments</label>
              <textarea
                placeholder="Enter additional comments or notes"
                value={studyData.comments}
                onChange={(e) => handleInputChange('comments', e.target.value)}
                className="form-textarea"
                rows="3"
              />
            </div>
          </div>
        </div>

        <div className="action-section">
          <button 
            onClick={handleSaveStudy}
            disabled={loading || !isLoggedIn}
            className="save-btn primary"
          >
            {loading ? <RefreshCw size={20} className="animate-spin" /> : <Save size={20} />}
            {loading ? 'Saving...' : (mode === 'edit' ? 'Update Study' : 'Save Study')}
          </button>
        </div>
      </div>

      <input
        type="file"
        accept=".dcm,.dicom"
        multiple
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
    </div>
  );
};

export default AddStudyPage;