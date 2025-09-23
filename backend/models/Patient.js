import mongoose from "mongoose";

const patientSchema = new mongoose.Schema({
  // DICOM Standard Patient Module
  patientID: { type: String, required: true, unique: true }, // (0010,0020)
  patientName: { type: String, required: true }, // (0010,0010)
  patientBirthDate: Date, // (0010,0030)
  patientSex: { 
    type: String, 
    enum: ['M', 'F', 'O', ''], 
    default: '' 
  }, // (0010,0040)
  patientBirthTime: String, // (0010,0032)
  patientAge: String, // (0010,1010)
  patientWeight: Number, // (0010,1030)
  patientSize: Number, // (0010,1020)
  patientAddress: String, // (0010,1040)
  patientComments: String, // (0010,4000)
  
  // Additional patient information
  patientInsurancePlanCodeSequence: String,
  issuerOfPatientID: String, // (0010,0021)
  otherPatientIDs: [String], // (0010,1000)
  otherPatientNames: [String], // (0010,1001)
  ethnicGroup: String, // (0010,2160)
  occupation: String, // (0010,2180)
  additionalPatientHistory: String, // (0010,21B0)
  
  // System fields
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  
  // Optional fields for PACS system management
  mrn: String, // Medical Record Number
  accountNumber: String,
  
  // Statistics
  totalStudies: { type: Number, default: 0 },
  totalSeries: { type: Number, default: 0 },
  totalInstances: { type: Number, default: 0 }
});

// Indexes for better query performance
patientSchema.index({ patientID: 1 });
patientSchema.index({ patientName: 1 });
patientSchema.index({ patientBirthDate: 1 });
patientSchema.index({ patientSex: 1 });
patientSchema.index({ createdAt: -1 });

// Update the updatedAt field before saving
patientSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for formatted patient name
patientSchema.virtual('formattedName').get(function() {
  return this.patientName || 'Unknown Patient';
});

// Method to calculate age from birth date
patientSchema.methods.calculateAge = function() {
  if (!this.patientBirthDate) return null;
  
  const today = new Date();
  const birthDate = new Date(this.patientBirthDate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

const Patient = mongoose.models.Patient || mongoose.model("Patient", patientSchema);
export default Patient;