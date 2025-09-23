import React, { useState } from "react";
import PACSSearchResults from "./components/PACS/PACSSearchResults";
import PACSStudyDetails from "./components/PACS/PACSStudyDetails";
import DicomViewer from "./components/DicomViewer";
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

function App() {
  const [viewMode, setViewMode] = useState("search"); // 'search', 'studyDetails', or 'dicom'
  const [files, setFiles] = useState([]);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Track login state

  const handleViewSeries = (selectedFiles) => {
    setFiles(selectedFiles);
    setViewMode("dicom");
  };

  const handleStudySelect = (study) => {
    setSelectedStudy(study);
    setViewMode("studyDetails");
  };

  const handleBackToSearch = () => {
    setSelectedStudy(null);
    setViewMode("search");
  };

  // Mock login handler (replace with actual authentication logic)
  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  // Mock signup handler (replace with actual authentication logic)
  const handleSignup = () => {
    setIsLoggedIn(true);
  };

  return (
    <ErrorBoundary>
      {viewMode === "search" && (
        <PACSSearchResults
          onStudySelect={handleStudySelect}
          onViewSeries={handleViewSeries}
          isLoggedIn={isLoggedIn}
          onLogin={handleLogin}
          onSignup={handleSignup}
        />
      )}
      {viewMode === "studyDetails" && (
        <PACSStudyDetails
          selectedStudy={selectedStudy}
          onBackToSearch={handleBackToSearch}
          onViewSeries={handleViewSeries}
        />
      )}
      {viewMode === "dicom" && (
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
              onClick={() => setViewMode("search")}
            >
              Back to PACS
            </Button>
          </div>
          
          <DicomViewer files={files} />
        </div>
      )}
    </ErrorBoundary>
  );
}

export default App;