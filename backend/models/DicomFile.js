import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const DicomFile = sequelize.define('DicomFile', {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    patientId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: 'patients', key: 'id' },
    },
    studyId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: 'studies', key: 'id' },
    },
    seriesId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: 'series', key: 'id' },
    },
    sopInstanceUID: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    sopClassUID: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    transferSyntaxUID: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    filename: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    originalFilename: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    filePath: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    instanceNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    imageType: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    photometricInterpretation: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    rows: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    columns: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    bitsAllocated: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    bitsStored: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    highBit: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    pixelRepresentation: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    samplesPerPixel: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    imageDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    imageTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    acquisitionDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    acquisitionTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    windowCenter: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    windowWidth: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    pixelSpacing: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    sliceThickness: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    sliceLocation: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    imagePosition: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    imageOrientation: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    processingStatus: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      defaultValue: 'pending',
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
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
    tableName: 'dicom_files',
    indexes: [
      { fields: ['sopInstanceUID'] },
      { fields: ['patientId', 'studyId', 'seriesId'] },
      { fields: ['instanceNumber'] },
      { fields: ['imageDate'] },
      { fields: ['processingStatus'] },
    ],
  });

  DicomFile.associate = (models) => {
    DicomFile.belongsTo(models.Patient, { foreignKey: 'patientId', as: 'Patient' });
    DicomFile.belongsTo(models.Study, { foreignKey: 'studyId', as: 'Study' });
    DicomFile.belongsTo(models.Series, { foreignKey: 'seriesId', as: 'Series' });
    DicomFile.hasMany(models.Annotation, { foreignKey: 'dicomFileId', as: 'Annotations' });
  };

  return DicomFile;
};