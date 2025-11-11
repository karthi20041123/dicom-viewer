import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import * as dicomParser from 'dicom-parser';
import AnalyticsDashboard from '../AnalyticsDashboard';
import './AddStudyPage.css';

const API_BASE_URL = 'http://localhost:5000/api';

const AddStudyPage = ({
  onBack,
  isLoggedIn,
  existingStudy = null,
  mode = 'create',
  onStudySaved,
}) => {
  const navigate = useNavigate();

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
  const [uploadedFileIds, setUploadedFileIds] = useState([]);
  const [uploadedFileNames, setUploadedFileNames] = useState([]);
  const [localStudies, setLocalStudies] = useState([]);
  const fileInputRef = useRef(null);
  const [effectiveIsLoggedIn, setEffectiveIsLoggedIn] = useState(isLoggedIn);
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    if (existingStudy && mode === 'edit') {
      setStudyData((prev) => ({
        ...prev,
        patientName: existingStudy.patientName || '',
        patientID: existingStudy.patientID || '',
        studyDate: existingStudy.studyDate
          ? new Date(existingStudy.studyDate).toISOString().split('T')[0]
          : '',
        studyTime: existingStudy.studyTime || '',
        studyDescription: existingStudy.studyDescription || '',
        modality: existingStudy.modality || '',
        accessionNumber: existingStudy.accessionNumber || '',
        studyID: existingStudy.studyID || '',
        patientBirthDate: existingStudy.patientBirthDate || '',
        patientSex: existingStudy.patientSex || '',
        patientPhone: existingStudy.patientPhone || '',
        patientEmail: existingStudy.patientEmail || '',
        patientAddress: existingStudy.patientAddress || '',
        bodyPartExamined: existingStudy.bodyPartExamined || '',
        referringPhysician: existingStudy.referringPhysician || '',
        studyPriority: existingStudy.studyPriority || 'routine',
        studyStatus: existingStudy.studyStatus || 'scheduled',
        comments: existingStudy.comments || '',
      }));
      setUploadedFileIds(existingStudy.dicomFileIds || []);
      setUploadedFileNames(existingStudy.uploadedFileNames || []);
      setLocalStudies(existingStudy.series ? [{ ...existingStudy, series: new Map(existingStudy.series.map(s => [s._id, s])) }] : []);
    }

    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    setEffectiveIsLoggedIn(isLoggedIn || !!token);
  }, [existingStudy, mode, isLoggedIn]);

  if (showAnalytics) {
    return <AnalyticsDashboard onBack={() => setShowAnalytics(false)} />;
  }

  const getAuthToken = () => {
    return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  };

  const handleInputChange = (field, value) => {
    setStudyData((prev) => ({
      ...prev,
      [field]: value,
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

  const getBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleSaveStudy = async () => {
    if (!effectiveIsLoggedIn) {
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
        id: studyData.studyID || generateStudyID(),
        patientName: studyData.patientName,
        patientID: studyData.patientID,
        patientBirthDate: studyData.patientBirthDate,
        patientSex: studyData.patientSex,
        patientPhone: studyData.patientPhone,
        patientEmail: studyData.patientEmail,
        patientAddress: studyData.patientAddress,
        studyID: studyData.studyID || generateStudyID(),
        studyDate: studyData.studyDate,
        studyTime: studyData.studyTime,
        studyDescription: studyData.studyDescription,
        modality: studyData.modality,
        accessionNumber: studyData.accessionNumber || generateAccessionNumber(),
        bodyPartExamined: studyData.bodyPartExamined,
        referringPhysician: studyData.referringPhysician,
        studyPriority: studyData.studyPriority,
        studyStatus: studyData.studyStatus,
        comments: studyData.comments,
        dicomFileIds: uploadedFileIds,
        uploadedFileNames,
        numberOfSeries: localStudies.reduce((sum, study) => sum + (study.series?.size || 0), 0),
        numberOfImages: localStudies.reduce((sum, study) => sum + Array.from(study.series?.values() || []).reduce((s, series) => s + series.instances.length, 0), 0),
        series: localStudies.length > 0 ? Array.from(localStudies[0].series.values()) : [],
      };

      if (onStudySaved) {
        onStudySaved(finalStudyData);
      }

      // Convert files to base64 for localStorage
      let savableStudy = { ...finalStudyData };
      if (savableStudy.series && savableStudy.series.length > 0) {
        savableStudy.series = await Promise.all(savableStudy.series.map(async (ser) => ({
          ...ser,
          instances: await Promise.all(ser.instances.map(async (inst) => {
            if (inst.file) {
              const fileBase64 = await getBase64(inst.file);
              return { ...inst, file: undefined, fileBase64 };
            }
            return inst;
          })),
        })));
      }

      const existingLocalStudies = JSON.parse(localStorage.getItem('localStudies') || '[]');
      if (mode === 'edit' && existingStudy) {
        const updatedStudies = existingLocalStudies.map(s => s.id === existingStudy.id ? savableStudy : s);
        localStorage.setItem('localStudies', JSON.stringify(updatedStudies));
        setMessage('Study updated locally successfully!');
      } else {
        existingLocalStudies.push(savableStudy);
        localStorage.setItem('localStudies', JSON.stringify(existingLocalStudies));
        setMessage('Study created locally successfully!');
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
          setUploadedFileIds([]);
          setUploadedFileNames([]);
          setLocalStudies([]);
        }
      }, 2000);
    } catch (error) {
      console.error('Error saving study locally:', error);
      setMessage('Failed to save study locally: ' + error.message);
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadClick = () => {
    if (!effectiveIsLoggedIn) {
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

    if (!effectiveIsLoggedIn) {
      setMessage('Please log in to upload files');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // REMOVED: Size check and confirm dialog
    // No more warnings about 4MB, 50 images, or localStorage limits

    setIsUploading(true);
    setUploadProgress(0);
    setLoading(true);

    try {
      const newStudiesMap = new Map();
      let processedFiles = 0;
      let firstFileMetadata = null;

      for (const file of files) {
        // REMOVED: 100MB per file check
        // REMOVED: .dcm/.dicom extension check (still recommended, but not enforced)

        const arrayBuffer = await file.arrayBuffer();
        const byteArray = new Uint8Array(arrayBuffer);
        let dataSet;

        try {
          dataSet = dicomParser.parseDicom(byteArray);
        } catch (error) {
          console.warn(`Skipping invalid DICOM file: ${file.name}`, error);
          processedFiles++;
          setUploadProgress((processedFiles / files.length) * 100);
          continue;
        }

        const studyInstanceUID = dataSet.string('x0020000d') || `study_${Date.now()}_${Math.random()}`;
        const seriesInstanceUID = dataSet.string('x0020000e') || `series_${Date.now()}_${Math.random()}`;
        const patientName = studyData.patientName || dataSet.string('x00100010') || 'Unknown Patient';
        const patientID = studyData.patientID || dataSet.string('x00100020') || 'Unknown ID';
        const studyDate = studyData.studyDate || dataSet.string('x00080020') || '';
        const modality = studyData.modality || dataSet.string('x00080060') || 'Unknown';
        const studyDescription = studyData.studyDescription || dataSet.string('x00081030') || 'No Description';
        const accessionNumber = studyData.accessionNumber || dataSet.string('x00080050') || generateAccessionNumber();
        const sopInstanceUID = dataSet.string('x00080018') || `sop_${Date.now()}_${Math.random()}`;
        const instanceNumber = dataSet.string('x00200013') || '1';
        const patientBirthDate = dataSet.string('x00100030') || '';
        const patientSex = dataSet.string('x00100040') || '';

        if (!firstFileMetadata && processedFiles === 0) {
          firstFileMetadata = {
            patientName: dataSet.string('x00100010') || '',
            patientID: dataSet.string('x00100020') || '',
            patientBirthDate: dataSet.string('x00100030') || '',
            patientSex: dataSet.string('x00100040') || '',
            studyID: dataSet.string('x0020000d') || '',
            studyDate: dataSet.string('x00080020') || '',
            studyTime: dataSet.string('x00080030') || '',
            studyDescription: dataSet.string('x00081030') || '',
            modality: dataSet.string('x00080060') || '',
            accessionNumber: dataSet.string('x00080050') || '',
          };
        }

        let study = newStudiesMap.get(studyInstanceUID);
        if (!study) {
          study = {
            id: studyInstanceUID,
            patientName,
            patientID,
            patientBirthDate: studyData.patientBirthDate || patientBirthDate,
            patientSex: studyData.patientSex || patientSex,
            patientPhone: studyData.patientPhone || '',
            patientEmail: studyData.patientEmail || '',
            patientAddress: studyData.patientAddress || '',
            studyID: studyData.studyID || studyInstanceUID,
            studyDate,
            studyTime: studyData.studyTime || '',
            studyDescription,
            modality,
            accessionNumber,
            bodyPartExamined: studyData.bodyPartExamined || '',
            referringPhysician: studyData.referringPhysician || '',
            studyPriority: studyData.studyPriority || 'routine',
            studyStatus: studyData.studyStatus || 'scheduled',
            comments: studyData.comments || '',
            numberOfSeries: 0,
            numberOfImages: 0,
            series: new Map(),
          };
          newStudiesMap.set(studyInstanceUID, study);
        }

        let series = study.series.get(seriesInstanceUID);
        if (!series) {
          series = {
            _id: seriesInstanceUID,
            instances: [],
          };
          study.series.set(seriesInstanceUID, series);
          study.numberOfSeries += 1;
        }

        series.instances.push({
          sopInstanceUID,
          filename: file.name,
          instanceNumber,
          file,
        });
        study.numberOfImages += 1;

        processedFiles++;
        setUploadProgress((processedFiles / files.length) * 100);
      }

      if (processedFiles > 0) {
        const newStudies = Array.from(newStudiesMap.values()).map(study => ({
          ...study,
          series: Array.from(study.series.values()),
        }));
        setLocalStudies(newStudies);
        setUploadedFileIds((prev) => [
          ...prev,
          ...newStudies.flatMap(study =>
            study.series.flatMap(series =>
              series.instances.map(instance => instance.sopInstanceUID)
            )
          ),
        ]);
        setUploadedFileNames((prev) => [...prev, ...files.map(file => file.name)]);
        setMessage(`Successfully processed ${processedFiles} DICOM files!`);

        if (firstFileMetadata) {
          setStudyData((prev) => ({
            ...prev,
            patientName: prev.patientName || firstFileMetadata.patientName,
            patientID: prev.patientID || firstFileMetadata.patientID,
            patientBirthDate:
              prev.patientBirthDate ||
              (firstFileMetadata.patientBirthDate
                ? new Date(firstFileMetadata.patientBirthDate).toISOString().split('T')[0]
                : ''),
            patientSex: prev.patientSex || firstFileMetadata.patientSex,
            studyID: prev.studyID || firstFileMetadata.studyID,
            studyDate:
              prev.studyDate ||
              (firstFileMetadata.studyDate
                ? new Date(firstFileMetadata.studyDate).toISOString().split('T')[0]
                : ''),
            studyTime:
              prev.studyTime ||
              (firstFileMetadata.studyTime
                ? firstFileMetadata.studyTime.slice(0, 5)
                : prev.studyTime),
            studyDescription: prev.studyDescription || firstFileMetadata.studyDescription,
            modality: prev.modality || firstFileMetadata.modality,
            accessionNumber: prev.accessionNumber || firstFileMetadata.accessionNumber,
          }));
        }
      } else {
        setMessage('No valid DICOM files were processed.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setMessage(`Processing failed: ${error.message}`);
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

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/');
    }
  };

  return (
    <div className="details-container">
      <div className="details-header">
        <button onClick={handleBack} className="back-btn">
          <ArrowLeft size={24} />
          Back to Studies
        </button>
        <h1 className="details-title">Add Study Details</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowAnalytics(true)}
            className="analytics-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Analytics
          </button>
          <button onClick={handleUploadClick} className="upload-btn" disabled={isUploading}>
            <Upload size={20} />
            {isUploading ? 'Processing...' : 'Upload DICOM'}
          </button>
        </div>
      </div>

      {isUploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
          </div>
          <p>Processing files... {Math.round(uploadProgress)}%</p>
        </div>
      )}

      {message && (
        <div
          className={`message-banner ${
            message.includes('Error') || message.includes('failed')
              ? 'error'
              : 'success'
          }`}
        >
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
            disabled={loading || !effectiveIsLoggedIn}
            className="save-btn primary"
          >
            {loading ? <RefreshCw size={20} className="animate-spin" /> : <Save size={20} />}
            {loading ? 'Saving...' : mode === 'edit' ? 'Update Study' : 'Save Study'}
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