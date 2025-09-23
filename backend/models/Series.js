import mongoose from "mongoose";

const seriesSchema = new mongoose.Schema({
  study: { type: mongoose.Schema.Types.ObjectId, ref: 'Study', required: true },
  seriesInstanceUID: { type: String, required: true, unique: true },
  seriesNumber: Number,
  seriesDate: Date,
  seriesTime: String,
  seriesDescription: String,
  modality: String,
  bodyPartExamined: String,
  numberOfInstances: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Series = mongoose.models.Series || mongoose.model("Series", seriesSchema);
export default Series;