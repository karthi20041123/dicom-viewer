import mongoose from "mongoose";

const dicomFileSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  study: { type: mongoose.Schema.Types.ObjectId, ref: 'Study', required: true },
  series: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  
  // DICOM identifiers
  sopInstanceUID: { type: String, required: true, unique: true },
  sopClassUID: String,
  transferSyntaxUID: String,
  
  // File information
  filename: String,
  originalFilename: String,
  filePath: { type: String, required: true },
  fileSize: Number,
  
  // Image properties
  instanceNumber: Number,
  imageType: [String],
  photometricInterpretation: String,
  rows: Number,
  columns: Number,
  bitsAllocated: Number,
  bitsStored: Number,
  highBit: Number,
  pixelRepresentation: Number,
  samplesPerPixel: Number,
  
  // Clinical data
  imageDate: Date,
  imageTime: String,
  acquisitionDate: Date,
  acquisitionTime: String,
  
  // Window/Level
  windowCenter: [Number],
  windowWidth: [Number],
  
  // Spatial information
  pixelSpacing: [Number],
  sliceThickness: Number,
  sliceLocation: Number,
  imagePosition: [Number],
  imageOrientation: [Number],
  
  // Processing status
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  
  // Metadata
  metadata: mongoose.Schema.Types.Mixed,
  
  // Annotations
  annotations: [{
    type: {
      type: String,
      enum: ['measurement', 'arrow', 'text', 'circle', 'rectangle'],
      required: true
    },
    coordinates: mongoose.Schema.Types.Mixed,
    properties: mongoose.Schema.Types.Mixed,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for better query performance
dicomFileSchema.index({ sopInstanceUID: 1 });
dicomFileSchema.index({ patient: 1, study: 1, series: 1 });
dicomFileSchema.index({ instanceNumber: 1 });
dicomFileSchema.index({ imageDate: 1 });
dicomFileSchema.index({ processingStatus: 1 });

const DicomFile = mongoose.models.DicomFile || mongoose.model("DicomFile", dicomFileSchema);
export default DicomFile;