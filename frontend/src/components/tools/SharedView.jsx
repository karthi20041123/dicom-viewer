import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Typography,
  IconButton,
  Box,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import "../styles/SharedView.css";

const SharedView = ({ viewerRef, files, isImageLoaded, onClose, disabled }) => {
  const [email, setEmail] = useState("");
  const [canView, setCanView] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [error, setError] = useState("");

  const handleGenerateLink = () => {
    if (!isImageLoaded || !files?.length) {
      setError("No study loaded to share.");
      return;
    }

    // A simple unique ID for the study
    const studyId = `study_${Math.random().toString(36).substr(2, 9)}`;

    // Encode permissions into the URL
    const permissions = {
      view: canView,
      edit: canEdit,
    };
    const generatedLink = `${window.location.origin}/dicom-viewer/share/${studyId}?permissions=${encodeURIComponent(
      JSON.stringify(permissions)
    )}`;
    setShareLink(generatedLink);
    setError("");

    if (email) {
      // In a real application, you would send this link via a backend service
      console.log(`Sending share link to ${email} with permissions:`, permissions);
      // Example of a possible API call:
      // api.sendShareLink({ to: email, link: generatedLink, permissions });
    }
  };

  const handleCopyLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      alert("Share link copied to clipboard!");
    }
  };

  return (
    <Dialog
      open={true}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      className="shared-view-dialog"
      PaperProps={{
        sx: {
          backgroundColor: "#ffffff",
          boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
          borderRadius: "8px",
        },
      }}
    >
      <DialogTitle sx={{ backgroundColor: "#ffffff", fontWeight: "bold" }}>
        Share Study 📤
      </DialogTitle>
      <DialogContent sx={{ backgroundColor: "#ffffff", padding: "20px" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="body1">
            Share this study with others. They can view or edit based on the permissions you set.
          </Typography>
          <TextField
            label="Recipient Email (Optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            disabled={disabled}
            variant="outlined"
            placeholder="Enter email to send the link"
            sx={{ backgroundColor: "#ffffff" }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={canView}
                onChange={(e) => setCanView(e.target.checked)}
                disabled={disabled}
              />
            }
            label="Allow Viewing"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={canEdit}
                onChange={(e) => setCanEdit(e.target.checked)}
                disabled={disabled}
              />
            }
            label="Allow Editing"
          />
          {shareLink && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField
                label="Share Link"
                value={shareLink}
                fullWidth
                InputProps={{ readOnly: true }}
                variant="outlined"
                sx={{ backgroundColor: "#ffffff" }}
              />
              <IconButton onClick={handleCopyLink} disabled={disabled}>
                <ContentCopyIcon />
              </IconButton>
            </Box>
          )}
          {error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ backgroundColor: "#ffffff", padding: "16px" }}>
        <Button onClick={onClose} disabled={disabled}>
          Cancel
        </Button>
        <Button
          onClick={handleGenerateLink}
          variant="contained"
          disabled={disabled || (!canView && !canEdit)}
        >
          Generate Link
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SharedView;