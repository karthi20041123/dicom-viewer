// associations.js
import User from "./models/User.js";
import Patient from "./models/Patient.js";
import Study from "./models/Study.js";
import Series from "./models/Series.js";
import Instance from "./models/Instance.js";
import DicomFile from "./models/DicomFile.js";

// ----------------- Associations -----------------

// Patient → Study
Patient.hasMany(Study, { foreignKey: "patientId", as: "studies" });
Study.belongsTo(Patient, { foreignKey: "patientId", as: "patient" });

// Study → Series
Study.hasMany(Series, { foreignKey: "studyId", as: "series" });
Series.belongsTo(Study, { foreignKey: "studyId", as: "study" });

// Series → Instance
Series.hasMany(Instance, { foreignKey: "seriesId", as: "instances" });
Instance.belongsTo(Series, { foreignKey: "seriesId", as: "series" });

// Patient + Study + Series → DicomFile
Patient.hasMany(DicomFile, { foreignKey: "patientId", as: "dicomFiles" });
Study.hasMany(DicomFile, { foreignKey: "studyId", as: "dicomFiles" });
Series.hasMany(DicomFile, { foreignKey: "seriesId", as: "dicomFiles" });

DicomFile.belongsTo(Patient, { foreignKey: "patientId", as: "patient" });
DicomFile.belongsTo(Study, { foreignKey: "studyId", as: "study" });
DicomFile.belongsTo(Series, { foreignKey: "seriesId", as: "series" });

// User → DicomFile (annotations createdBy)
User.hasMany(DicomFile, { foreignKey: "createdBy", as: "createdFiles" });
DicomFile.belongsTo(User, { foreignKey: "createdBy", as: "creator" });

console.log("✅ Sequelize associations applied");
