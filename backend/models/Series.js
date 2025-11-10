// models/Series.js
import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Series = sequelize.define('Series', {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    studyId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: 'studies', key: 'id' },
    },
    seriesInstanceUID: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    seriesNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    seriesDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    seriesTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    seriesDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    modality: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    bodyPartExamined: {
      type: DataTypes.STRING(255),
      allowNull: true,
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
    tableName: 'series',
    indexes: [
      { fields: ['seriesInstanceUID'] },
    ],
  });

  Series.associate = (models) => {
    Series.belongsTo(models.Study, { foreignKey: 'studyId', as: 'Study' });
    Series.hasMany(models.Instance, { foreignKey: 'seriesId', as: 'Instances' });
    Series.hasMany(models.DicomFile, { foreignKey: 'seriesId', as: 'DicomFiles' });
  };

  return Series;
};