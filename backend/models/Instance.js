import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Instance = sequelize.define('Instance', {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
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
    instanceNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    fileKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
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
    tableName: 'instances',
    indexes: [
      { fields: ['sopInstanceUID'] },
    ],
  });

  Instance.associate = (models) => {
    Instance.belongsTo(models.Series, { foreignKey: 'seriesId', as: 'Series' });
  };

  return Instance;
};