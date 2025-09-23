import express from "express";
import multer from "multer";
import { authenticateUser, registerUser, storeDicomFromBuffer } from "../services/dicomSCP.js";
import dcmjs from "dcmjs";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Test route for GET /api/dicom
router.get("/", (req, res) => {
  res.json({ message: "DICOM API is working" });
});

// Anonymization route
router.post("/anonymize", async (req, res) => {
  try {
    const { dicomData } = req.body;
    if (!dicomData) {
      return res.status(400).json({ error: "No DICOM data provided" });
    }

    const dataset = dcmjs.data.DicomMessage.readFile(Buffer.from(dicomData));
    const anonymized = dcmjs.data.DicomMetaDictionary.anonymize(dataset);

    res.json(anonymized);
  } catch (error) {
    console.error("Anonymization error:", error);
    res.status(500).json({ error: "Anonymization failed" });
  }
});

// Login route
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await authenticateUser(email, password);
    res.status(200).json({
      message: "Login successful",
      user: { id: user._id, email: user.email },
    });
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
});

// Signup route
router.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await registerUser(email, password);
    res.status(201).json({
      message: "Signup successful",
      user: { id: user._id, email: user.email },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Upload DICOM files route
router.post("/upload", upload.array("dicomFiles"), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const storedFiles = [];
    for (const file of files) {
      const buffer = file.buffer;
      const stored = await storeDicomFromBuffer(buffer);
      storedFiles.push(stored);
    }

    res.status(200).json({
      message: "DICOM files uploaded and stored successfully",
      files: storedFiles,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
