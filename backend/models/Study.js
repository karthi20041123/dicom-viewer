import mongoose from "mongoose";

const studySchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  studyInstanceUID: { type: String, required: true, unique: true },
  studyID: String,
  studyDate: Date, // Not marked as optional
  studyTime: String,
  studyDescription: String,
  modalitiesInStudy: [String],
  numberOfSeries: { type: Number, default: 0 },
  numberOfInstances: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Study = mongoose.models.Study || mongoose.model("Study", studySchema);
export default Study;