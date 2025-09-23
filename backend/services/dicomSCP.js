import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import dcmjs from "dcmjs";
import pkg from "dcmjs-dimse";
const { Server, Scp, Dataset, Status } = pkg;

import DicomFile from "../models/DicomFile.js";
import Study from "../models/Study.js";
import Series from "../models/Series.js";
import Patient from "../models/Patient.js";
import User from "../models/User.js";

dotenv.config();

const STORAGE_PATH = process.env.STORAGE_PATH || "./storage/dicom";
const SERVER_AET = process.env.PACS_AET || "MY_DICOM_SCP";
const PORT = parseInt(process.env.PACS_PORT) || 11112;

// Ensure storage folder exists
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

class MyScp extends Scp {
  constructor(socket, opts) {
    super(socket, opts);
    this.association = null;
  }

  associationRequest(association) {
    console.log(`Association request from AE: ${association.callingAet}`);
    this.association = association;
    return true;
  }

  associationReleaseRequest() {
    console.log("Association released");
    this.association = null;
  }

  cEchoRequest(request, callback) {
    console.log("C-ECHO received");
    callback({ status: Status.Success });
  }

  async cStoreRequest(request, callback) {
    try {
      const dataset = Dataset.read(request.getDatasetBytes());
      
      // Extract DICOM data
      const sopInstanceUID = dataset.SOPInstanceUID;
      const studyInstanceUID = dataset.StudyInstanceUID;
      const seriesInstanceUID = dataset.SeriesInstanceUID;
      const patientID = dataset.PatientID;
      const patientName = dataset.PatientName;
      
      // Create file path
      const filePath = path.join(STORAGE_PATH, `${sopInstanceUID}.dcm`);
      fs.writeFileSync(filePath, request.getDatasetBytes());

      // Create or update patient
      const patient = await Patient.findOneAndUpdate(
        { patientID },
        {
          patientName: patientName || patientID,
          patientBirthDate: dataset.PatientBirthDate ? new Date(dataset.PatientBirthDate) : null,
          patientSex: dataset.PatientSex,
          patientAge: dataset.PatientAge
        },
        { upsert: true, new: true }
      );

      // Create or update study
      const study = await Study.findOneAndUpdate(
        { studyInstanceUID, patient: patient._id },
        {
          studyID: dataset.StudyID,
          studyDate: dataset.StudyDate ? new Date(dataset.StudyDate) : null,
          studyTime: dataset.StudyTime,
          studyDescription: dataset.StudyDescription,
          modalitiesInStudy: dataset.Modality ? [dataset.Modality] : []
        },
        { upsert: true, new: true }
      );

      // Create or update series
      const series = await Series.findOneAndUpdate(
        { seriesInstanceUID, study: study._id },
        {
          seriesNumber: dataset.SeriesNumber,
          seriesDate: dataset.SeriesDate ? new Date(dataset.SeriesDate) : null,
          seriesTime: dataset.SeriesTime,
          seriesDescription: dataset.SeriesDescription,
          modality: dataset.Modality,
          bodyPartExamined: dataset.BodyPartExamined
        },
        { upsert: true, new: true }
      );

      // Create DICOM file record
      const dicomFile = new DicomFile({
        patient: patient._id,
        study: study._id,
        series: series._id,
        sopInstanceUID,
        sopClassUID: dataset.SOPClassUID,
        transferSyntaxUID: dataset.TransferSyntaxUID,
        filename: `${sopInstanceUID}.dcm`,
        filePath,
        fileSize: fs.statSync(filePath).size,
        instanceNumber: dataset.InstanceNumber,
        imageType: dataset.ImageType,
        photometricInterpretation: dataset.PhotometricInterpretation,
        rows: dataset.Rows,
        columns: dataset.Columns,
        bitsAllocated: dataset.BitsAllocated,
        bitsStored: dataset.BitsStored,
        highBit: dataset.HighBit,
        pixelRepresentation: dataset.PixelRepresentation,
        samplesPerPixel: dataset.SamplesPerPixel,
        imageDate: dataset.ImageDate ? new Date(dataset.ImageDate) : null,
        imageTime: dataset.ImageTime,
        acquisitionDate: dataset.AcquisitionDate ? new Date(dataset.AcquisitionDate) : null,
        acquisitionTime: dataset.AcquisitionTime,
        windowCenter: dataset.WindowCenter ? (Array.isArray(dataset.WindowCenter) ? dataset.WindowCenter : [dataset.WindowCenter]) : null,
        windowWidth: dataset.WindowWidth ? (Array.isArray(dataset.WindowWidth) ? dataset.WindowWidth : [dataset.WindowWidth]) : null,
        pixelSpacing: dataset.PixelSpacing,
        sliceThickness: dataset.SliceThickness,
        sliceLocation: dataset.SliceLocation,
        imagePosition: dataset.ImagePositionPatient,
        imageOrientation: dataset.ImageOrientationPatient,
        metadata: dataset,
        processingStatus: 'completed'
      });

      await dicomFile.save();

      // Update counts
      await Series.findByIdAndUpdate(series._id, {
        $inc: { numberOfInstances: 1 }
      });

      await Study.findByIdAndUpdate(study._id, {
        $inc: { numberOfInstances: 1 }
      });

      console.log(`✅ DICOM file stored: ${sopInstanceUID}`);
      callback({ status: Status.Success });

    } catch (err) {
      console.error("❌ Error saving DICOM:", err);
      callback({ status: Status.ProcessingFailure });
    }
  }
}

// Enhanced helper functions
async function storeDicomFromBuffer(buffer, filename = null) {
  try {
    const { data: { dictionary } } = dcmjs.data.DicomMessage.readFile(buffer);
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dictionary);

    const sopInstanceUID = dataset.SOPInstanceUID;
    const studyInstanceUID = dataset.StudyInstanceUID;
    const seriesInstanceUID = dataset.SeriesInstanceUID;
    const patientID = dataset.PatientID;

    const actualFilename = filename || `${sopInstanceUID}.dcm`;
    const filePath = path.join(STORAGE_PATH, actualFilename);

    fs.writeFileSync(filePath, buffer);

    // Create or update patient
    const patient = await Patient.findOneAndUpdate(
      { patientID },
      {
        patientName: dataset.PatientName || patientID,
        patientBirthDate: dataset.PatientBirthDate ? new Date(dataset.PatientBirthDate) : null,
        patientSex: dataset.PatientSex,
        patientAge: dataset.PatientAge
      },
      { upsert: true, new: true }
    );

    // Create or update study
    const study = await Study.findOneAndUpdate(
      { studyInstanceUID, patient: patient._id },
      {
        studyID: dataset.StudyID,
        studyDate: dataset.StudyDate ? new Date(dataset.StudyDate) : null,
        studyTime: dataset.StudyTime,
        studyDescription: dataset.StudyDescription,
        modalitiesInStudy: dataset.Modality ? [dataset.Modality] : []
      },
      { upsert: true, new: true }
    );

    // Create or update series
    const series = await Series.findOneAndUpdate(
      { seriesInstanceUID, study: study._id },
      {
        seriesNumber: dataset.SeriesNumber,
        seriesDate: dataset.SeriesDate ? new Date(dataset.SeriesDate) : null,
        seriesTime: dataset.SeriesTime,
        seriesDescription: dataset.SeriesDescription,
        modality: dataset.Modality,
        bodyPartExamined: dataset.BodyPartExamined
      },
      { upsert: true, new: true }
    );

    // Create DICOM file record
    const dicomFile = new DicomFile({
      patient: patient._id,
      study: study._id,
      series: series._id,
      sopInstanceUID,
      sopClassUID: dataset.SOPClassUID,
      originalFilename: filename,
      filename: actualFilename,
      filePath,
      fileSize: buffer.length,
      instanceNumber: dataset.InstanceNumber,
      rows: dataset.Rows,
      columns: dataset.Columns,
      windowCenter: dataset.WindowCenter ? [dataset.WindowCenter].flat() : null,
      windowWidth: dataset.WindowWidth ? [dataset.WindowWidth].flat() : null,
      metadata: dataset,
      processingStatus: 'completed'
    });

    await dicomFile.save();

    // Update counts
    await Series.findByIdAndUpdate(series._id, {
      $inc: { numberOfInstances: 1 }
    });

    await Study.findByIdAndUpdate(study._id, {
      $inc: { numberOfInstances: 1 }
    });

    return { sopInstanceUID, filePath, dicomFile };
  } catch (error) {
    throw new Error(`Error storing DICOM file: ${error.message}`);
  }
}

async function authenticateUser(email, password) {
  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      throw new Error("Invalid email or password");
    }
    return user;
  } catch (error) {
    throw new Error(error.message);
  }
}

async function registerUser(email, password) {
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error("Email already registered");
    }
    const user = new User({ email, password });
    await user.save();
    return user;
  } catch (error) {
    throw new Error(error.message);
  }
}

export { MyScp, authenticateUser, registerUser, storeDicomFromBuffer };