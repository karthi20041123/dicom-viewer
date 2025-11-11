import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Study = sequelize.define('Study', {
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
    studyInstanceUID: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    studyID: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    studyDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    studyTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    studyDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    modalitiesInStudy: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    accessionNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    bodyPartExamined: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    referringPhysician: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    studyPriority: {
      type: DataTypes.ENUM('routine', 'urgent', 'emergent', 'stat'),
      defaultValue: 'routine',
    },
    studyStatus: {
      type: DataTypes.ENUM('scheduled', 'in-progress', 'completed', 'cancelled'),
      defaultValue: 'scheduled',
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    numberOfSeries: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    numberOfInstances: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
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
    tableName: 'studies',
    indexes: [
      { fields: ['studyInstanceUID'] },
      { fields: ['studyDate'] },
      { fields: ['accessionNumber'] },
      { fields: ['studyStatus'] },
    ],
  });

  Study.associate = (models) => {
    Study.belongsTo(models.Patient, { foreignKey: 'patientId', as: 'Patient' });
    Study.hasMany(models.Series, { foreignKey: 'studyId', as: 'Series' });
    Study.hasMany(models.DicomFile, { foreignKey: 'studyId', as: 'DicomFiles' });
  };

  return Study;
};