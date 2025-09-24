import React, { useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import PACSSearchResults from "./components/PACS/PACSSearchResults";
import PACSStudyDetails from "./components/PACS/PACSStudyDetails";
import DicomViewer from "./components/DicomViewer";
import AddStudyPage from "./components/PACS/AddStudyPage"; // Import AddStudyPage
import Button from "@mui/material/Button";
import "./App.css";

// Error boundary
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Error boundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-container">
          <h1>Something went wrong. Please reload the page.</h1>
          <Button
            onClick={() => window.location.reload()}
            sx={{
              backgroundColor: "#020079",
              color: "#ffffff",
              "&:hover": { backgroundColor: "#003366" },
              borderRadius: "8px",
            }}
          >
            Reload
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Mock API request function (replace with your actual implementation)
const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
  const headers = { ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(`http://localhost:5000/api${endpoint}`, {
      ...options,
      headers,
    });
    if (response.status === 401) throw new Error("Authentication expired. Please log in again.");
    return response;
  } catch (error) {
    console.error(`API request error for ${endpoint}:`, error);
    throw error;
  }
};

// Mock fetchStudies function (replace with your actual implementation)
const fetchStudies = async () => {
  // Placeholder logic
  console.log("Fetching studies...");
};

// Mock setLoading function (replace with your state management)
const setLoading = (value) => {
  console.log(`Loading set to ${value}`);
};

function AppContent() {
  const [files, setFiles] = useState([]);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Track login state
  const navigate = useNavigate();

  const handleViewSeries = (selectedFiles) => {
    setFiles(selectedFiles);
    navigate("/dicom");
  };

  const handleStudySelect = (study) => {
    setSelectedStudy(study);
    navigate("/study-details");
  };

  const handleBackToSearch = () => {
    setSelectedStudy(null);
    navigate("/");
  };

  // Mock login handler (replace with actual authentication logic)
  const handleLogin = () => {
    setIsLoggedIn(true);
    // Simulate successful login (e.g., set token in localStorage)
    localStorage.setItem("authToken", "mock-token");
  };

  // Mock signup handler (replace with actual authentication logic)
  const handleSignup = () => {
    setIsLoggedIn(true);
    // Simulate successful signup
    localStorage.setItem("authToken", "mock-token");
  };

  const commonProps = {
    isLoggedIn: isLoggedIn, // Renamed to match prop expectations
    apiRequest,
    fetchStudies,
    setLoading,
    onLogin: handleLogin,
    onSignup: handleSignup,
  };

  return (
    <Routes>
      <Route
        path="/"
        element={
          <PACSSearchResults
            {...commonProps}
            onStudySelect={handleStudySelect}
            onViewSeries={handleViewSeries}
          />
        }
      />
      <Route
        path="/add-study"
        element={
          <AddStudyPage
            {...commonProps}
            onBack={handleBackToSearch} // Pass onBack to navigate back to search results
          />
        }
      />
      <Route
        path="/study-details"
        element={
          <PACSStudyDetails
            selectedStudy={selectedStudy}
            onBackToSearch={handleBackToSearch}
            onViewSeries={handleViewSeries}
            onLogout={() => setIsLoggedIn(false)} // Pass onLogout to update login state
          />
        }
      />
      <Route
        path="/dicom"
        element={
          <div className="dicom-viewer-container">
            <h1 className="dicom-viewer-title">DICOM Viewer with MPR</h1>
            <div className="back-button-container">
              <Button
                variant="contained"
                sx={{
                  backgroundColor: "#020079",
                  color: "#ffffff",
                  "&:hover": { backgroundColor: "#003366" },
                  borderRadius: "8px",
                }}
                onClick={() => navigate("/")}
              >
                Back to PACS
              </Button>
            </div>
            <DicomViewer files={files} />
          </div>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;