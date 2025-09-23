import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  User,
  Eye,
  Download,
  Upload,
  RefreshCw,
  Filter,
  Moon,
  Sun,
} from 'lucide-react';
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

// API base URL
const API_BASE_URL = 'http://localhost:5000/api';

// Slide transition for dialogs
const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// Configure external dependencies
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

const PACSSearchResults = ({ onStudySelect, onViewSeries, isLoggedIn, onLogin, onSignup, onLogout }) => {
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
  const [showMenu, setShowMenu] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showSampleViewer, setShowSampleViewer] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const effectiveIsLoggedIn = isControlled ? isLoggedIn : localIsLoggedIn;

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
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        handleLogout();
        throw new Error('Authentication expired. Please log in again.');
      }

      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`API request to ${endpoint} timed out`);
        throw new Error('Request timed out. Please try again with smaller files.');
      }
      console.error(`API request error for ${endpoint}:`, error);
      throw error;
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
        console.log('✅ Cornerstone web workers initialized');
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

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark');
      document.body.classList.toggle('dark-mode', savedTheme === 'dark');
    }

    if (effectiveIsLoggedIn) {
      fetchStudies();
    }

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
  }, [isControlled, effectiveIsLoggedIn]);

  useEffect(() => {
    if (isControlled && isLoggedIn) {
      const userData = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
      setUserProfile(userData);
      fetchStudies();
    }
  }, [isLoggedIn, isControlled]);

  useEffect(() => {
    handleAutoSearch();
  }, [searchFilters, allStudies]);

  const fetchStudies = async () => {
    if (!effectiveIsLoggedIn) return;

    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      Object.entries(searchFilters).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          queryParams.append(key, value);
        }
      });

      const response = await apiRequest(`/dicom/studies?${queryParams.toString()}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAllStudies(data.studies);
          setFilteredStudies(data.studies);
        } else {
          setMessage(data.message || 'Failed to fetch studies');
        }
      } else {
        const errorData = await response.json();
        setMessage(errorData.message || `Failed to fetch studies: ${response.statusText}`);
      }
    } catch (error) {
      setMessage(error.message || 'Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

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
    if (!files.length) return;

    if (!effectiveIsLoggedIn) {
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
    }

    setIsUploading(true);
    setUploadProgress(0);
    setLoading(true);

    try {
      const formData = new FormData();
      files.forEach((file, index) => {
        formData.append('dicomFiles', file);
        // Simulate progress
        setTimeout(() => {
          setUploadProgress(((index + 1) / files.length) * 100);
        }, index * 500); // Slower progress for better UX
      });

      const response = await apiRequest('/dicom/upload', {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        let errorMessage = `Upload failed: Server responded with status ${response.status}`;
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          if (errorData.errors) {
            console.warn('Upload errors:', errorData.errors);
            errorMessage += `. ${errorData.errors.length} file(s) failed to process. Check console for details.`;
          }
        } else {
          const text = await response.text();
          console.error('Non-JSON error response:', text);
          errorMessage = 'Upload failed: Server error. Check console for details.';
        }
        throw new Error(errorMessage);
      }

      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.success) {
          setMessage(`Successfully uploaded ${data.uploadResults.length} files!`);
          await fetchStudies();
          if (data.errors && data.errors.length > 0) {
            console.warn('Upload errors:', data.errors);
            setMessage(`Uploaded ${data.uploadResults.length} files with ${data.errors.length} errors. Check console for details.`);
          }
        } else {
          throw new Error(data.message || 'Upload failed');
        }
      } else {
        const text = await response.text();
        console.error('Non-JSON response received:', text);
        throw new Error('Upload failed: Server returned an unexpected response');
      }
    } catch (error) {
      console.error('Upload error:', error);
      let errorMessage = error.message || 'Upload failed: Unable to connect to server';
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Upload failed: Server connection was reset. Please check if the server is running and try again.';
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

  const handleSearch = async () => {
    await fetchStudies();
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
      const seriesResponse = await apiRequest(`/dicom/study/${study.id}/series`);
      if (!seriesResponse.ok) {
        throw new Error('Failed to fetch series data');
      }

      const seriesData = await seriesResponse.json();
      if (!seriesData.success || !seriesData.series.length) {
        throw new Error('No series found for this study');
      }

      const zip = new JSZip();
      let exportedCount = 0;

      for (const series of seriesData.series) {
        const instancesResponse = await apiRequest(`/dicom/series/${series._id}/instances`);
        if (!instancesResponse.ok) continue;

        const instancesData = await instancesResponse.json();
        if (!instancesData.success || !instancesData.instances.length) continue;

        for (const instance of instancesData.instances) {
          try {
            if (selectedFormat === 'dcm') {
              const fileResponse = await apiRequest(`/dicom/file/${instance.sopInstanceUID}`);
              if (fileResponse.ok) {
                const fileBlob = await fileResponse.blob();
                const fileName = instance.filename || `image_${instance.instanceNumber}.dcm`;
                zip.file(fileName, fileBlob);
                exportedCount++;
              }
            } else {
              const fileResponse = await apiRequest(`/dicom/file/${instance.sopInstanceUID}`);
              if (fileResponse.ok) {
                const fileBlob = await fileResponse.blob();
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
    setShowMenu(false);
    setAllStudies([]);
    setFilteredStudies([]);

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
    await fetchStudies();
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

  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.body.classList.toggle('dark-mode', !isDarkMode);
    localStorage.setItem('theme', !isDarkMode ? 'dark' : 'light');
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
    <div className="pacs-main-container">
      <div className="pacs-header">
        <button onClick={() => setShowSampleViewer(true)} className="sample-dicom-btn">
          Sample DICOM Viewer
        </button>
        <h1 className="pacs-title">PACS SERVER</h1>
        <div className="header-icons">
          <a href="#" onClick={toggleTheme} className="theme-toggle-btn" role="button">
            {isDarkMode ? <Sun size={28} /> : <Moon size={28} />}
          </a>
          {!effectiveIsLoggedIn && (
            <a href="#" onClick={() => setLoginOpen(true)} className="login-btn" role="button">
              <User size={28} />
            </a>
          )}
          {effectiveIsLoggedIn && (
            <div className="user-menu">
              <a href="#" onClick={toggleMenu} className="user-initial-btn" role="button">
                {getUserInitial()}
              </a>
              {showMenu && (
                <div className="menu-popup">
                  <p className="menu-item" style={{ color: '#003366', fontWeight: 'bold' }}>
                    {userProfile?.profile?.firstName || userProfile?.username || userProfile?.email}
                  </p>
                  <hr style={{ margin: '8px 0' }} />
                  <button className="menu-item">Personal</button>
                  <button className="menu-item">Free plan</button>
                  <button className="menu-item">Settings</button>
                  <button className="menu-item">Language</button>
                  <button className="menu-item">Get help</button>
                  <button className="menu-item">Upgrade plan</button>
                  <button className="menu-item">Learn more</button>
                  <button onClick={handleLogout} className="menu-item">
                    <User size={20} style={{ marginRight: '8px' }} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isUploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
          </div>
          <p>Uploading files...</p>
        </div>
      )}

      {message && (
        <div className={`message-banner ${message.includes('Error') || message.includes('failed') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="upload-dicom-container">
        <button onClick={handleUploadClick} className="upload-dicom-btn" disabled={isUploading}>
          <Upload size={24} style={{ marginRight: '8px' }} />
          {isUploading ? 'Uploading...' : 'Upload DICOM'}
        </button>
      </div>

      <div className="pacs-search-container">
        <div className="search-box">
          <div className="search-icon"><Search size={28} /></div>
          <h2 className="search-title">STUDY SEARCH</h2>
        </div>

        <div className="search-form-grid">
          <div className="search-field">
            <label className="field-label">Patient Name</label>
            <input
              type="text"
              placeholder="Eg. John Doe"
              value={searchFilters.patientName}
              onChange={(e) => setSearchFilters((prev) => ({ ...prev, patientName: e.target.value }))}
              className="text-input"
            />
          </div>

          <div className="search-field">
            <label className="field-label">Patient ID</label>
            <input
              type="text"
              placeholder="Patient ID"
              value={searchFilters.patientID}
              onChange={(e) => setSearchFilters((prev) => ({ ...prev, patientID: e.target.value }))}
              className="text-input"
            />
          </div>

          <div className="search-field">
            <label className="field-label">Study Date</label>
            <input
              type="date"
              placeholder="mm/dd/yyyy"
              value={searchFilters.studyDate}
              onChange={(e) => setSearchFilters((prev) => ({ ...prev, studyDate: e.target.value }))}
              className="text-input"
            />
          </div>

          <div className="search-field">
            <label className="field-label">Modality</label>
            <select
              value={searchFilters.modality}
              onChange={(e) => setSearchFilters((prev) => ({ ...prev, modality: e.target.value }))}
              className="text-input"
            >
              <option value="">Select Modality</option>
              <option value="CT">CT</option>
              <option value="MR">MR</option>
              <option value="XR">X-Ray</option>
              <option value="US">Ultrasound</option>
              <option value="NM">Nuclear Medicine</option>
            </select>
          </div>

          <div className="search-field">
            <label className="field-label">Accession Number</label>
            <input
              type="text"
              placeholder="Accession Number"
              value={searchFilters.accessionNumber}
              onChange={(e) => setSearchFilters((prev) => ({ ...prev, accessionNumber: e.target.value }))}
              className="text-input"
            />
          </div>
        </div>

        <div className="search-buttons">
          <button
            onClick={handleSearch}
            disabled={loading || !effectiveIsLoggedIn}
            className="search-btn"
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
            className="clear-btn"
          >
            <Filter size={20} className="mr-2 w-4 h-4" />
            Clear Filters
          </button>
        </div>
      </div>

      <div className="pacs-results-container">
        <div className="results-header">
          <h3 className="results-title">SEARCH RESULTS <span className="results-count">{filteredStudies.length}</span></h3>
        </div>

        {!effectiveIsLoggedIn ? (
          <div className="login-prompt">
            <p>Please log in to view and manage DICOM studies.</p>
            <button onClick={() => setLoginOpen(true)} className="login-prompt-btn">
              <User size={20} /> Log In
            </button>
          </div>
        ) : (
          <table className="results-table">
            <thead>
              <tr>
                <th className="table-header">PATIENT</th>
                <th className="table-header">STUDY DATE</th>
                <th className="table-header">MODALITY</th>
                <th className="table-header">DESCRIPTION</th>
                <th className="table-header">SERIES</th>
                <th className="table-header">IMAGES</th>
                <th className="table-header">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudies.map((study) => (
                <tr key={study.id} className="table-row">
                  <td className="table-cell">
                    <div className="patient-info">
                      <div className="patient-name">{study.patientName}</div>
                      <div className="patient-id">{study.patientID}</div>
                    </div>
                  </td>
                  <td className="table-cell">{study.studyDate ? new Date(study.studyDate).toLocaleDateString() : 'Unknown'}</td>
                  <td className="table-cell">
                    <span className="modality-badge">{study.modality}</span>
                  </td>
                  <td className="table-cell">{study.studyDescription}</td>
                  <td className="table-cell text-center">{study.numberOfSeries}</td>
                  <td className="table-cell text-center">{study.numberOfImages}</td>
                  <td className="table-cell">
                    <div className="action-buttons">
                      <a href="#" onClick={() => handleStudySelect(study)} className="action-btn view-btn" role="button">
                        <Eye size={18} className="w-3 h-3" />
                        View
                      </a>
                      <a href="#" onClick={() => handleExportStudy(study)} className="action-btn export-btn" role="button">
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

      <Dialog
        open={showSampleViewer}
        onClose={() => setShowSampleViewer(false)}
        fullWidth
        maxWidth="lg"
        TransitionComponent={Transition}
      >
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <img
            src={screenshot}
            alt="Sample DICOM Viewer"
            style={{ maxWidth: '100%', maxHeight: '80vh' }}
          />
        </div>
      </Dialog>
    </div>
  );
};

export default PACSSearchResults;