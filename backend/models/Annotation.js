import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Annotation = sequelize.define('Annotation', {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    dicomFileId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: 'dicom_files', key: 'id' },
    },
    type: {
      type: DataTypes.ENUM('measurement', 'arrow', 'text', 'circle', 'rectangle'),
      allowNull: false,
    },
    coordinates: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    properties: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'annotations',
    indexes: [
      { fields: ['dicomFileId'] },
    ],
  });

  Annotation.associate = (models) => {
    Annotation.belongsTo(models.DicomFile, { foreignKey: 'dicomFileId', as: 'DicomFile' });
    Annotation.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
  };

  return Annotation;
};