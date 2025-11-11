import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Patient = sequelize.define('Patient', {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    patientID: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    patientName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    patientBirthDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    patientSex: {
      type: DataTypes.ENUM('M', 'F', 'O', ''),
      defaultValue: '',
    },
    patientPhone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    patientEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    patientAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    patientBirthTime: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    patientAge: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    patientWeight: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    patientSize: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    patientComments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    patientInsurancePlanCodeSequence: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    issuerOfPatientID: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    otherPatientIDs: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    otherPatientNames: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    ethnicGroup: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    occupation: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    additionalPatientHistory: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    mrn: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    accountNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    totalStudies: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalSeries: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalInstances: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'patients',
    indexes: [
      { fields: ['patientID'] },
      { fields: ['patientName'] },
      { fields: ['patientBirthDate'] },
      { fields: ['patientSex'] },
      { fields: ['patientEmail'] },
      { fields: ['createdAt'] },
    ],
  });

  Patient.prototype.calculateAge = function () {
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

  Patient.associate = (models) => {
    Patient.hasMany(models.Study, { foreignKey: 'patientId', as: 'Studies' });
    Patient.hasMany(models.DicomFile, { foreignKey: 'patientId', as: 'DicomFiles' });
  };

  return Patient;
};