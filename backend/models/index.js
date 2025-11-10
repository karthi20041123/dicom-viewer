// models/index.js
import { readdirSync } from "fs";
import { basename, dirname } from "path";
import { fileURLToPath } from "url";
import { Sequelize } from "sequelize";
import config from "../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sequelize = new Sequelize(config.database, config.username, config.password, config);

const db = {};

const files = readdirSync(__dirname).filter(
  (file) =>
    file.indexOf(".") !== 0 &&
    file !== basename(__filename) &&
    file.slice(-3) === ".js"
);

for (const file of files) {
  const model = await import(`file://${__dirname}/${file}`);
  const namedModel = model.default(sequelize);
  db[namedModel.name] = namedModel;
}

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

export default db;