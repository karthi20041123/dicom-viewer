import express from "express";
import Study from "../models/Study.js";
import Series from "../models/Series.js";
import DicomFile from "../models/DicomFile.js";
import Patient from "../models/Patient.js";
import path from "path";
import fs from "fs";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// QIDO-RS: Search for Patients
router.get("/patients", authenticateToken, async (req, res) => {
  try {
    const { PatientName, PatientID, limit = 50, offset = 0 } = req.query;
    
    let query = {};
    if (PatientName) query.patientName = new RegExp(PatientName, 'i');
    if (PatientID) query.patientID = PatientID;

    const patients = await Patient.find(query)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ createdAt: -1 });

    const results = patients.map(patient => ({
      "00100010": { Value: [patient.patientName], vr: "PN" },
      "00100020": { Value: [patient.patientID], vr: "LO" },
      "00100030": { Value: [patient.patientBirthDate?.toISOString().split('T')[0] || ""], vr: "DA" },
      "00100040": { Value: [patient.patientSex || ""], vr: "CS" },
      "_id": patient._id
    }));

    res.set("Content-Type", "application/dicom+json");
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// QIDO-RS: Search for Studies
router.get("/studies", authenticateToken, async (req, res) => {
  try {
    const { PatientID, StudyDate, StudyDescription, limit = 50, offset = 0 } = req.query;
    
    let query = {};
    if (StudyDate) {
      const date = new Date(StudyDate);
      query.studyDate = {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999))
      };
    }
    if (StudyDescription) query.studyDescription = new RegExp(StudyDescription, 'i');

    const studies = await Study.find(query)
      .populate("patient")
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ studyDate: -1 });

    const results = studies.map(study => ({
      "00080020": { Value: [study.studyDate?.toISOString().split('T')[0] || ""], vr: "DA" },
      "00080030": { Value: [study.studyTime || ""], vr: "TM" },
      "00100010": { Value: [study.patient?.patientName || ""], vr: "PN" },
      "00100020": { Value: [study.patient?.patientID || ""], vr: "LO" },
      "0020000D": { Value: [study.studyInstanceUID], vr: "UI" },
      "00081030": { Value: [study.studyDescription || ""], vr: "LO" },
      "00080061": { Value: study.modalitiesInStudy || [], vr: "CS" },
      "_id": study._id,
      "_patient": study.patient
    }));

    res.set("Content-Type", "application/dicom+json");
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// QIDO-RS: Search for Series
router.get("/studies/:studyInstanceUID/series", authenticateToken, async (req, res) => {
  try {
    const { studyInstanceUID } = req.params;
    const study = await Study.findOne({ studyInstanceUID });
    
    if (!study) {
      return res.status(404).json({ message: "Study not found" });
    }

    const series = await Series.find({ study: study._id });
    
    const results = series.map(s => ({
      "0020000E": { Value: [s.seriesInstanceUID], vr: "UI" },
      "00200011": { Value: [s.seriesNumber?.toString() || ""], vr: "IS" },
      "00080021": { Value: [s.seriesDate?.toISOString().split('T')[0] || ""], vr: "DA" },
      "00080031": { Value: [s.seriesTime || ""], vr: "TM" },
      "0008103E": { Value: [s.seriesDescription || ""], vr: "LO" },
      "00080060": { Value: [s.modality || ""], vr: "CS" },
      "00200013": { Value: [s.numberOfInstances?.toString() || "0"], vr: "IS" },
      "_id": s._id
    }));

    res.set("Content-Type", "application/dicom+json");
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// QIDO-RS: Search for Instances
router.get("/studies/:studyInstanceUID/series/:seriesInstanceUID/instances", authenticateToken, async (req, res) => {
  try {
    const { studyInstanceUID, seriesInstanceUID } = req.params;
    
    const study = await Study.findOne({ studyInstanceUID });
    const series = await Series.findOne({ seriesInstanceUID, study: study._id });
    
    if (!study || !series) {
      return res.status(404).json({ message: "Study or Series not found" });
    }

    const instances = await DicomFile.find({ 
      study: study._id, 
      series: series._id 
    }).sort({ instanceNumber: 1 });

    const results = instances.map(instance => ({
      "00080018": { Value: [instance.sopInstanceUID], vr: "UI" },
      "00200013": { Value: [instance.instanceNumber?.toString() || ""], vr: "IS" },
      "00280010": { Value: [instance.rows?.toString() || ""], vr: "US" },
      "00280011": { Value: [instance.columns?.toString() || ""], vr: "US" },
      "00281050": { Value: instance.windowCenter || [], vr: "DS" },
      "00281051": { Value: instance.windowWidth || [], vr: "DS" },
      "_id": instance._id,
      "_filePath": instance.filePath
    }));

    res.set("Content-Type", "application/dicom+json");
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// WADO-RS: Retrieve Instance
router.get("/studies/:studyInstanceUID/series/:seriesInstanceUID/instances/:sopInstanceUID", authenticateToken, async (req, res) => {
  try {
    const { studyInstanceUID, seriesInstanceUID, sopInstanceUID } = req.params;
    
    const study = await Study.findOne({ studyInstanceUID });
    const series = await Series.findOne({ seriesInstanceUID });
    const dicomFile = await DicomFile.findOne({
      sopInstanceUID,
      study: study._id,
      series: series._id
    });

    if (!dicomFile) {
      return res.status(404).json({ message: "DICOM file not found" });
    }

    if (!fs.existsSync(dicomFile.filePath)) {
      return res.status(404).json({ message: "DICOM file not found on disk" });
    }

    res.set("Content-Type", "application/dicom");
    res.sendFile(path.resolve(dicomFile.filePath));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get DICOM file as blob for web viewer
router.get("/instance/:id/blob", authenticateToken, async (req, res) => {
  try {
    const dicomFile = await DicomFile.findById(req.params.id);
    
    if (!dicomFile || !fs.existsSync(dicomFile.filePath)) {
      return res.status(404).json({ message: "DICOM file not found" });
    }

    const fileBuffer = fs.readFileSync(dicomFile.filePath);
    res.set("Content-Type", "application/octet-stream");
    res.send(fileBuffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Save annotations
router.post("/instance/:id/annotations", authenticateToken, async (req, res) => {
  try {
    const { annotations } = req.body;
    
    await DicomFile.findByIdAndUpdate(req.params.id, {
      annotations: annotations.map(ann => ({
        ...ann,
        createdBy: req.user.id,
        createdAt: new Date()
      }))
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get annotations
router.get("/instance/:id/annotations", authenticateToken, async (req, res) => {
  try {
    const dicomFile = await DicomFile.findById(req.params.id)
      .populate('annotations.createdBy', 'username');
    
    res.json(dicomFile?.annotations || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;