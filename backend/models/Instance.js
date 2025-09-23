import mongoose from "mongoose";

const instanceSchema = new mongoose.Schema({
  series: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true },
  sopInstanceUID: { type: String, required: true, unique: true },
  instanceNumber: Number,
  fileKey: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Instance = mongoose.models.Instance || mongoose.model("Instance", instanceSchema);
export default Instance;