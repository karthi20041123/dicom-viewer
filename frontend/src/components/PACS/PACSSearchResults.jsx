import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  User,
  Eye,
  Download,
  Upload,
  RefreshCw,
  Filter,
  Plus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as dicomParser from 'dicom-parser';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Slide from '@mui/material/Slide';
import Login from '../Login';
import Signup from '../Signup';
import './PACSSearchResults.css';
import screenshot from '../../assets/Dicom.png';

// Slide transition for dialogs
const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// Configure external dependencies
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

const PACSSearchResults = ({ onStudySelect, onViewSeries, isLoggedIn, onLogin, onSignup, onLogout, onStudySaved }) => {
  const [allStudies, setAllStudies] = useState([]);
  const [filteredStudies, setFilteredStudies] = useState([]);
  const [searchFilters, setSearchFilters] = useState({
    patientName: '',
    patientID: '',
    studyDate: '',
    modality: '',
    accessionNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);
  const isControlled = typeof onLogout === 'function';
  const [localIsLoggedIn, setLocalIsLoggedIn] = useState(false);
  const isWebWorkerInitialized = useRef(false);
  const [userProfile, setUserProfile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const navigate = useNavigate();

  const effectiveIsLoggedIn = isControlled ? isLoggedIn : localIsLoggedIn;

  const getAuthToken = () => {
    return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  };

  // Helper to convert File to base64
  const getBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Helper to reconstruct File from base64
  const reconstructFile = async (fileBase64, filename) => {
    if (!fileBase64) return null;
    const response = await fetch(`data:application/octet-stream;base64,${fileBase64}`);
    const blob = await response.blob();
    return new File([blob], filename, { type: 'application/dicom' });
  };

  // Helper to check available localStorage space (approximate)
  const getLocalStorageSpace = () => {
    let data = '';
    try {
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          data += localStorage[key];
        }
      }
      return data ? 5 * 1024 * 1024 - (encodeURI(data).split(/%..|./).length - 1) : 5 * 1024 * 1024;
    } catch (e) {
      return 0;
    }
  };

  useEffect(() => {
    if (!isWebWorkerInitialized.current) {
      try {
        cornerstoneWADOImageLoader.webWorkerManager.initialize({
          maxWebWorkers: Math.max(4, navigator.hardwareConcurrency || 1),
          startWebWorkersOnDemand: true,
          webWorkerPath: 'https://unpkg.com/cornerstone-wado-image-loader@4.13.2/dist/legacy/cornerstoneWADOImageLoaderWebWorker.min.js',
          taskConfiguration: {
            decodeTask: {
              initializeCodecsOnStartup: false,
              codecsPath: 'https://unpkg.com/cornerstone-wado-image-loader@4.13.2/dist/legacy/codecs.js',
              usePDFJS: false,
              strict: false,
            },
          },
        });
        isWebWorkerInitialized.current = true;
        console.log('Cornerstone web workers initialized');
      } catch (err) {
        console.error('Failed to initialize Cornerstone web workers:', err);
        setMessage('Failed to initialize DICOM processing. Please try again.');
      }
    }

    if (!isControlled) {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const userData = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
      if (token && userData) {
        setLocalIsLoggedIn(true);
        setUserProfile(userData);
      } else {
        setLocalIsLoggedIn(false);
        setUserProfile(null);
      }
    }

    // Load and reconstruct studies from localStorage
    const loadStudies = async () => {
      const stored = JSON.parse(localStorage.getItem('localStudies') || '[]');
      const reconstructed = await Promise.all(stored.map(async (study) => {
        if (study.series && study.series.length > 0) {
          const recSeries = await Promise.all(study.series.map(async (ser) => ({
            ...ser,
            instances: await Promise.all(ser.instances.map(async (inst) => {
              if (inst.fileBase64) {
                const file = await reconstructFile(inst.fileBase64, inst.filename);
                return { ...inst, file, fileBase64: undefined };
              }
              return inst;
            })),
          })));
          return { ...study, series: recSeries };
        }
        return study;
      }));
      setAllStudies(reconstructed);
      setFilteredStudies(reconstructed);
    };

    loadStudies();

    return () => {
      if (isWebWorkerInitialized.current) {
        try {
          cornerstoneWADOImageLoader.webWorkerManager.terminate();
          isWebWorkerInitialized.current = false;
        } catch (err) {
          console.error('Failed to terminate Web Workers:', err);
        }
      }
    };
  }, [isControlled]);

  useEffect(() => {
    if (isControlled && isLoggedIn) {
      const userData = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
      setUserProfile(userData);
    }
  }, [isLoggedIn, isControlled]);

  useEffect(() => {
    if (onStudySaved) {
      setAllStudies((prev) => {
        const existingStudyIndex = prev.findIndex(study => study.id === onStudySaved.id);
        if (existingStudyIndex !== -1) {
          const updatedStudies = [...prev];
          updatedStudies[existingStudyIndex] = onStudySaved;
          return updatedStudies;
        }
        return [...prev, onStudySaved];
      });
      setFilteredStudies((prev) => {
        const existingStudyIndex = prev.findIndex(study => study.id === onStudySaved.id);
        if (existingStudyIndex !== -1) {
          const updatedStudies = [...prev];
          updatedStudies[existingStudyIndex] = onStudySaved;
          return updatedStudies;
        }
        return [...prev, onStudySaved];
      });
    }
  }, [onStudySaved]);

  useEffect(() => {
    handleAutoSearch();
  }, [searchFilters, allStudies]);

  const handleAutoSearch = () => {
    let filtered = allStudies;

    if (searchFilters.patientName.trim()) {
      filtered = filtered.filter((study) =>
        study.patientName.toLowerCase().includes(searchFilters.patientName.toLowerCase())
      );
    }

    if (searchFilters.patientID.trim()) {
      filtered = filtered.filter((study) =>
        study.patientID.toLowerCase().includes(searchFilters.patientID.toLowerCase())
      );
    }

    if (searchFilters.studyDate) {
      filtered = filtered.filter((study) =>
        study.studyDate === searchFilters.studyDate
      );
    }

    if (searchFilters.modality) {
      filtered = filtered.filter((study) =>
        study.modality === searchFilters.modality
      );
    }

    if (searchFilters.accessionNumber.trim()) {
      filtered = filtered.filter((study) =>
        study.accessionNumber.toLowerCase().includes(searchFilters.accessionNumber.toLowerCase())
      );
    }

    setFilteredStudies(filtered);
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

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 4 * 1024 * 1024) {
      const confirm = window.confirm(`Selected files total ~${(totalSize / 1024 / 1024).toFixed(2)}MB. This may exceed local storage limits. Proceed?`);
      if (!confirm) return;
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
      const newStudiesMap = new Map();
      let processedFiles = 0;

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const byteArray = new Uint8Array(arrayBuffer);
        let dataSet;

        try {
          dataSet = dicomParser.parseDicom(byteArray);
        } catch (error) {
          console.error(`Failed to parse DICOM file ${file.name}:`, error);
          continue;
        }

        const studyInstanceUID = dataSet.string('x0020000d') || `study_${Date.now()}_${Math.random()}`;
        const seriesInstanceUID = dataSet.string('x0020000e') || `series_${Date.now()}_${Math.random()}`;
        const patientName = dataSet.string('x00100010') || 'Unknown Patient';
        const patientID = dataSet.string('x00100020') || 'Unknown ID';
        const studyDate = dataSet.string('x00080020') || '';
        const modality = dataSet.string('x00080060') || 'Unknown';
        const studyDescription = dataSet.string('x00081030') || 'No Description';
        const accessionNumber = dataSet.string('x00080050') || '';
        const sopInstanceUID = dataSet.string('x00080018') || `sop_${Date.now()}_${Math.random()}`;
        const instanceNumber = dataSet.string('x00200013') || '1';

        let study = newStudiesMap.get(studyInstanceUID);
        if (!study) {
          study = {
            id: studyInstanceUID,
            patientName,
            patientID,
            studyDate,
            modality,
            studyDescription,
            accessionNumber,
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

        // For upload in search page, apply same size logic: if too many images, save metadata only
        let savableNewStudies;
        if (newStudies.reduce((sum, s) => sum + s.numberOfImages, 0) > 50) {
          const confirm = window.confirm(`Large upload (${processedFiles} files). Save metadata only to avoid quota issues? OK for metadata, Cancel to abort.`);
          if (!confirm) {
            setMessage('Upload aborted.');
            return;
          }
          savableNewStudies = newStudies.map(study => ({
            ...study,
            series: study.series.map(ser => ({
              ...ser,
              instances: ser.instances.map(inst => ({
                sopInstanceUID: inst.sopInstanceUID,
                filename: inst.filename,
                instanceNumber: inst.instanceNumber,
              }))
            })),
            _note: 'Binaries skipped due to size'
          }));
        } else {
          savableNewStudies = await Promise.all(newStudies.map(async (study) => {
            const series = await Promise.all(study.series.map(async (ser) => ({
              ...ser,
              instances: await Promise.all(ser.instances.map(async (inst) => {
                const fileBase64 = await getBase64(inst.file);
                return { ...inst, file: undefined, fileBase64 };
              })),
            })));
            return { ...study, series };
          }));
        }

        // Update localStorage with savable versions
        const existingLocalStudies = JSON.parse(localStorage.getItem('localStudies') || '[]');
        const updatedStudies = [...existingLocalStudies, ...savableNewStudies];
        const savableJSON = JSON.stringify(updatedStudies);
        if (encodeURI(savableJSON).split(/%..|./).length - 1 > getLocalStorageSpace()) {
          setMessage('Insufficient space in localStorage. Clear some studies and try again.');
          return;
        }
        localStorage.setItem('localStudies', savableJSON);

        // Update state with original files for in-memory use
        setAllStudies((prev) => [...prev, ...newStudies]);
        setFilteredStudies((prev) => [...prev, ...newStudies]);
        setMessage(`Successfully processed ${processedFiles} DICOM files locally!`);
      } else {
        setMessage('No valid DICOM files were processed.');
      }
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        setMessage('Local storage quota exceeded during upload. Try fewer files or clear data.');
      } else {
        console.error('Upload error:', error);
        setMessage(`Processing failed: ${error.message}`);
      }
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

  const handleStudySelect = (study) => {
    if (onStudySelect) {
      onStudySelect(study);
    }
  };

  const handleExportStudy = async (study, format = 'zip') => {
    if (!study) {
      setMessage('No study selected to export!');
      return;
    }

    if (!effectiveIsLoggedIn) {
      setMessage('Please log in to export studies');
      return;
    }

    let selectedFormat = format;
    if (!selectedFormat || selectedFormat === 'zip') {
      selectedFormat = prompt('Select format (jpg/png/dcm):', 'jpg');
      if (!selectedFormat || !['jpg', 'png', 'dcm'].includes(selectedFormat.toLowerCase())) {
        setMessage('Invalid format! Please choose jpg, png, or dcm.');
        return;
      }
      selectedFormat = selectedFormat.toLowerCase();
    }

    setLoading(true);

    try {
      const zip = new JSZip();
      let exportedCount = 0;

      for (const series of study.series) {
        for (const instance of series.instances) {
          try {
            if (selectedFormat === 'dcm') {
              const fileBlob = instance.file;
              const fileName = instance.filename || `image_${instance.instanceNumber}.dcm`;
              zip.file(fileName, fileBlob);
              exportedCount++;
            } else {
              const fileBlob = instance.file;
              const arrayBuffer = await fileBlob.arrayBuffer();

              const element = document.createElement('div');
              element.style.width = '512px';
              element.style.height = '512px';
              document.body.appendChild(element);

              cornerstone.enable(element);

              const blobUrl = URL.createObjectURL(fileBlob);
              const imageId = `dicomweb:${blobUrl}`;

              const image = await cornerstone.loadAndCacheImage(imageId);
              if (image) {
                cornerstone.displayImage(element, image);
                await new Promise((resolve) => setTimeout(resolve, 50));

                const canvas = element.querySelector('canvas');
                if (canvas) {
                  let fileData, fileName;
                  if (selectedFormat === 'png') {
                    fileData = canvas.toDataURL('image/png').split(',')[1];
                    fileName = `${instance.filename || 'image'}_${instance.instanceNumber}.png`;
                  } else if (selectedFormat === 'jpg') {
                    fileData = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
                    fileName = `${instance.filename || 'image'}_${instance.instanceNumber}.jpg`;
                  }

                  if (fileData) {
                    zip.file(fileName, fileData, { base64: true });
                    exportedCount++;
                  }
                }
              }

              cornerstone.disable(element);
              document.body.removeChild(element);
              URL.revokeObjectURL(blobUrl);
            }
          } catch (instanceError) {
            console.error(`Error processing instance ${instance.sopInstanceUID}:`, instanceError);
          }
        }
      }

      if (exportedCount > 0) {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const fileName = `study_${study.patientName}_${new Date().toISOString().split('T')[0]}.zip`;
        saveAs(zipBlob, fileName);
        setMessage(`Successfully exported ${exportedCount} files`);
      } else {
        setMessage('No files were exported. Please try again.');
      }
    } catch (error) {
      console.error('Export error:', error);
      setMessage(`Export failed: ${error.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('tokenExpires');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('user');

    setMessage('You have been logged out');
    setAllStudies([]);
    setFilteredStudies([]);
    localStorage.removeItem('localStudies'); // Clear studies on logout

    if (isControlled) {
      onLogout();
    } else {
      setLocalIsLoggedIn(false);
      setUserProfile(null);
    }

    setTimeout(() => setMessage(''), 1500);
  };

  const handleLoginSuccess = async () => {
    setLoginOpen(false);
    setMessage('');
    const userData = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    if (isControlled) {
      if (onLogin) onLogin();
    } else {
      setLocalIsLoggedIn(true);
      setUserProfile(userData);
    }
  };

  const handleSignupSuccess = () => {
    setSignupOpen(false);
    setMessage('Account created successfully! Please log in.');
    if (isControlled) {
      if (onSignup) onSignup();
    }
    setTimeout(() => setMessage(''), 1500);
  };

  const switchToSignup = () => {
    setLoginOpen(false);
    setSignupOpen(true);
  };

  const switchToLogin = () => {
    setSignupOpen(false);
    setLoginOpen(true);
  };

  const getUserInitial = () => {
    const user = userProfile || JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    if (!user) return 'U';
    const firstName = user?.profile?.firstName;
    if (firstName && firstName.length > 0) return firstName.charAt(0).toUpperCase();
    const username = user?.username;
    if (username && username.length > 0) return username.charAt(0).toUpperCase();
    return 'U';
  };

  return (
    <>
      <div className="pacsrs-header">
        <div className="pacsrs-header-buttons">
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/add-study')}
            className="pacsrs-add-study-btn"
            startIcon={<Plus size={24} />}
            sx={{ marginRight: '8px' }}
          >
            Add New Study
          </Button>
        </div>
        <h1 className="pacsrs-title">PACS SERVER</h1>
        <div className="pacsrs-header-icons">
          {!effectiveIsLoggedIn && (
            <a href="#" onClick={() => setLoginOpen(true)} className="pacsrs-login-btn" role="button">
              <User size={28} />
            </a>
          )}
          {effectiveIsLoggedIn && (
            <div className="pacsrs-user-menu">
              <a href="#" onClick={handleLogout} className="pacsrs-user-initial-btn" role="button">
                {getUserInitial()}
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="pacsrs-main-container">
        {isUploading && (
          <div className="pacsrs-upload-progress">
            <div className="pacsrs-progress-bar">
              <div className="pacsrs-progress-fill" style={{ width: `${uploadProgress}%` }}></div>
            </div>
            <p>Processing files...</p>
          </div>
        )}

        {message && (
          <div className={`pacsrs-message-banner ${message.includes('Error') || message.includes('failed') || message.includes('quota') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}

        {/* <div className="pacsrs-upload-dicom-container">
          <button onClick={handleUploadClick} className="pacsrs-upload-dicom-btn" disabled={isUploading}>
            <Upload size={24} style={{ marginRight: '8px' }} />
            {isUploading ? 'Processing...' : 'Upload DICOM'}
          </button>
        </div> */}

        <div className="pacsrs-search-container">
          <div className="pacsrs-search-box">
            <div className="pacsrs-search-icon"><Search size={28} /></div>
            <h2 className="pacsrs-search-title">STUDY SEARCH</h2>
          </div>

          <div className="pacsrs-search-form-grid">
            <div className="pacsrs-search-field">
              <label className="pacsrs-field-label">Patient Name</label>
              <input
                type="text"
                placeholder="Eg. John Doe"
                value={searchFilters.patientName}
                onChange={(e) =>  setSearchFilters((prev) => ({ ...prev, patientName: e.target.value }))}
                className="pacsrs-text-input"
              />
            </div>

            <div className="pacsrs-search-field">
              <label className="pacsrs-field-label">Patient ID</label>
              <input
                type="text"
                placeholder="Patient ID"
                value={searchFilters.patientID}
                onChange={(e) => setSearchFilters((prev) => ({ ...prev, patientID: e.target.value }))}
                className="pacsrs-text-input"
              />
            </div>

            <div className="pacsrs-search-field">
              <label className="pacsrs-field-label">Study Date</label>
              <input
                type="date"
                placeholder="mm/dd/yyyy"
                value={searchFilters.studyDate}
                onChange={(e) => setSearchFilters((prev) => ({ ...prev, studyDate: e.target.value }))}
                className="pacsrs-text-input"
              />
            </div>

            <div className="pacsrs-search-field">
              <label className="pacsrs-field-label">Modality</label>
              <select
                value={searchFilters.modality}
                onChange={(e) => setSearchFilters((prev) => ({ ...prev, modality: e.target.value }))}
                className="pacsrs-text-input"
              >
                <option value="">Select Modality</option>
                <option value="CT">CT</option>
                <option value="MR">MR</option>
                <option value="XR">X-Ray</option>
                <option value="US">Ultrasound</option>
                <option value="NM">Nuclear Medicine</option>
              </select>
            </div>

            <div className="pacsrs-search-field">
              <label className="pacsrs-field-label">Accession Number</label>
              <input
                type="text"
                placeholder="Accession Number"
                value={searchFilters.accessionNumber}
                onChange={(e) => setSearchFilters((prev) => ({ ...prev, accessionNumber: e.target.value }))}
                className="pacsrs-text-input"
              />
            </div>
          </div>

          <div className="pacsrs-search-buttons">
            <button
              onClick={() => handleAutoSearch()}
              disabled={loading || !effectiveIsLoggedIn}
              className="pacsrs-search-btn"
            >
              {loading ? <RefreshCw size={20} className="mr-2 w-4 h-4 animate-spin" /> : <Search size={20} className="mr-2 w-4 h-4" />}
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              onClick={() => {
                setSearchFilters({
                  patientName: '',
                  patientID: '',
                  studyDate: '',
                  modality: '',
                  accessionNumber: '',
                });
              }}
              className="pacsrs-clear-btn"
            >
              <Filter size={20} className="mr-2 w-4 h-4" />
              Clear Filters
            </button>
          </div>
        </div>

        <div className="pacsrs-results-container">
          <div className="pacsrs-results-header">
            <h3 className="pacsrs-results-title">SEARCH RESULTS <span className="pacsrs-results-count">{filteredStudies.length}</span></h3>
          </div>

          {!effectiveIsLoggedIn ? (
            <div className="pacsrs-login-prompt">
              <p>Please log in to view and manage DICOM studies.</p>
              <button onClick={() => setLoginOpen(true)} className="pacsrs-login-prompt-btn">
                <User size={20} /> Log In
              </button>
            </div>
          ) : (
            <table className="pacsrs-results-table">
              <thead>
                <tr>
                  <th className="pacsrs-table-header">PATIENT</th>
                  <th className="pacsrs-table-header">STUDY DATE</th>
                  <th className="pacsrs-table-header">MODALITY</th>
                  <th className="pacsrs-table-header">DESCRIPTION</th>
                  <th className="pacsrs-table-header">SERIES</th>
                  <th className="pacsrs-table-header">IMAGES</th>
                  <th className="pacsrs-table-header">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudies.map((study) => (
                  <tr key={study.id} className="pacsrs-table-row">
                    <td className="pacsrs-table-cell">
                      <div className="pacsrs-patient-info">
                        <div className="pacsrs-patient-name">{study.patientName}</div>
                        <div className="pacsrs-patient-id">{study.patientID}</div>
                      </div>
                    </td>
                    <td className="pacsrs-table-cell">{study.studyDate ? new Date(study.studyDate).toLocaleDateString() : 'Unknown'}</td>
                    <td className="pacsrs-table-cell">
                      <span className="pacsrs-modality-badge">{study.modality}</span>
                    </td>
                    <td className="pacsrs-table-cell">{study.studyDescription}</td>
                    <td className="pacsrs-table-cell text-center">{study.numberOfSeries}</td>
                    <td className="pacsrs-table-cell text-center">{study.numberOfImages}</td>
                    <td className="pacsrs-table-cell">
                      <div className="pacsrs-action-buttons">
                        <a href="#" onClick={() => handleStudySelect(study)} className="pacsrs-action-btn pacsrs-view-btn" role="button">
                          <Eye size={18} className="w-3 h-3" />
                          View
                        </a>
                        <a href="#" onClick={() => handleExportStudy(study)} className="pacsrs-action-btn pacsrs-export-btn" role="button">
                          <Download size={18} className="w-3 h-3" />
                          Export
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <input
          type="file"
          accept=".dcm,.dicom"
          multiple
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />

        <Dialog
          open={loginOpen}
          onClose={() => setLoginOpen(false)}
          fullWidth
          maxWidth="sm"
          TransitionComponent={Transition}
        >
          <Login
            open={loginOpen}
            onClose={() => setLoginOpen(false)}
            onSignupClick={switchToSignup}
            onLoginSuccess={handleLoginSuccess}
          />
        </Dialog>

        <Dialog
          open={signupOpen}
          onClose={() => setSignupOpen(false)}
          fullWidth
          maxWidth="md"
          TransitionComponent={Transition}
        >
          <Signup
            onClose={() => setSignupOpen(false)}
            onLoginClick={switchToLogin}
            onSignup={handleSignupSuccess}
          />
        </Dialog>
      </div>
    </>
  );
};

export default PACSSearchResults;