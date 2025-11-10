import express from 'express';
import { Sequelize, DataTypes, Op } from 'sequelize';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dicomParser from 'dicom-parser';
import speakeasy from 'speakeasy';
import nodemailer from 'nodemailer';
import { config as dotenvConfig } from 'dotenv';
import User from './models/User.js';
import Patient from './models/Patient.js';
import Study from './models/Study.js';
import Series from './models/Series.js';
import Instance from './models/Instance.js';
import DicomFile from './models/DicomFile.js';
import Annotation from './models/Annotation.js';

// ES6 module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();

// Load environment variables
dotenvConfig();
if (!process.env.JWT_SECRET || !process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASS || !process.env.DB_NAME) {
  console.error('❌ Missing required environment variables: JWT_SECRET, DB_HOST, DB_USER, DB_PASS, or DB_NAME');
  process.exit(1);
}

// Check for email credentials
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn('⚠️ Email credentials (EMAIL_USER or EMAIL_PASS) not set. Email notifications will be disabled.');
}

// Create uploads directory
const uploadsDir = path.join(__dirname, process.env.STORAGE_PATH || 'Uploads/dicom');
const createUploadsDir = async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    console.log('✅ Created uploads directory:', uploadsDir);
  } catch (err) {
    console.error('❌ Failed to create uploads directory:', err);
    process.exit(1);
  }
};
createUploadsDir();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));

// Configure multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.access(uploadsDir);
      cb(null, uploadsDir);
    } catch (err) {
      await fs.mkdir(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + (path.extname(file.originalname) || '.dcm'));
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.dcm', '.dicom', ''];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(fileExtension) || file.mimetype === 'application/dicom') {
      cb(null, true);
    } else {
      cb(new Error('Only DICOM files are allowed'), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
  },
});

// Multer error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    return res.status(400).json({ success: false, message: `Multer error: ${err.message}` });
  } else if (err) {
    console.error('Upload error:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.error('No token provided');
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification failed:', err);
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Sequelize connection
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  dialect: 'mysql',
  logging: (msg) => console.log('Sequelize SQL:', msg),
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// Initialize models
const models = {
  User: User(sequelize, DataTypes),
  Patient: Patient(sequelize, DataTypes),
  Study: Study(sequelize, DataTypes),
  Series: Series(sequelize, DataTypes),
  Instance: Instance(sequelize, DataTypes),
  DicomFile: DicomFile(sequelize, DataTypes),
  Annotation: Annotation(sequelize, DataTypes),
};

// Define associations
Object.keys(models).forEach((modelName) => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Database connection
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to MySQL');
    await sequelize.sync({ force: false });
    console.log('✅ Database synced');
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};
connectDB();

// Email transporter setup
const transporter = (process.env.EMAIL_USER && process.env.EMAIL_PASS) ? nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
}) : null;

// Function to send login notification
const sendLoginNotification = async (email, username) => {
  if (!transporter) {
    console.log('Skipping login notification: Email credentials not configured.');
    return;
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Successful Login Notification',
    text: `Dear ${username},\n\nYou have successfully logged in to our system on ${new Date().toLocaleString()}.\n\nIf this wasn't you, please secure your account immediately.\n\nBest regards,\nYour App Team`,
    html: `<p>Dear ${username},</p><p>You have successfully logged in to our system on ${new Date().toLocaleString()}.</p><p>If this wasn't you, please secure your account immediately.</p><p>Best regards,<br>Your App Team</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Login notification sent to ' + email);
  } catch (error) {
    console.error('Error sending login notification to ' + email + ':', error);
  }
};

// Parse DICOM metadata
const parseDicomMetadata = async (filePath) => {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const byteArray = new Uint8Array(fileBuffer);
    const dataSet = dicomParser.parseDicom(byteArray, { untilTag: 'x7fe00010' });

    const parseDicomDate = (dateStr) => {
      if (!dateStr || dateStr.trim() === '') return null;
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const formattedDate = `${year}-${month}-${day}`;
      const parsedDate = new Date(formattedDate);
      return isNaN(parsedDate.getTime()) ? null : parsedDate;
    };

    return {
      patientName: dataSet.string('x00100010') || 'Unknown',
      patientID: dataSet.string('x00100020') || 'Unknown',
      patientBirthDate: parseDicomDate(dataSet.string('x00100030')),
      patientSex: dataSet.string('x00100040') || '',
      studyInstanceUID: dataSet.string('x0020000d') || '',
      studyID: dataSet.string('x00200010'),
      studyDate: parseDicomDate(dataSet.string('x00080020')),
      studyTime: dataSet.string('x00080030'),
      studyDescription: dataSet.string('x00081030'),
      seriesInstanceUID: dataSet.string('x0020000e') || '',
      seriesNumber: dataSet.intString('x00200011'),
      seriesDate: parseDicomDate(dataSet.string('x00080021')),
      seriesTime: dataSet.string('x00080031'),
      seriesDescription: dataSet.string('x0008103e'),
      modality: dataSet.string('x00080060'),
      bodyPartExamined: dataSet.string('x00180015'),
      sopInstanceUID: dataSet.string('x00080018') || '',
      sopClassUID: dataSet.string('x00080016'),
      instanceNumber: dataSet.intString('x00200013'),
      transferSyntaxUID: dataSet.string('x00020010'),
      imageType: dataSet.string('x00080008'),
      imageDate: parseDicomDate(dataSet.string('x00080023')),
      imageTime: dataSet.string('x00080033'),
      acquisitionDate: parseDicomDate(dataSet.string('x00080022')),
      acquisitionTime: dataSet.string('x00080032'),
      rows: dataSet.uint16('x00280010'),
      columns: dataSet.uint16('x00280011'),
      bitsAllocated: dataSet.uint16('x00280100'),
      bitsStored: dataSet.uint16('x00280101'),
      highBit: dataSet.uint16('x00280102'),
      pixelRepresentation: dataSet.uint16('x00280103'),
      samplesPerPixel: dataSet.uint16('x00280002'),
      photometricInterpretation: dataSet.string('x00280004'),
      windowCenter: dataSet.string('x00281050'),
      windowWidth: dataSet.string('x00281051'),
      pixelSpacing: dataSet.string('x00280030'),
      sliceThickness: dataSet.floatString('x00180050'),
      sliceLocation: dataSet.floatString('x00201041'),
      imagePosition: dataSet.string('x00200032'),
      imageOrientation: dataSet.string('x00200037'),
      rawMetadata: { ...dataSet.elements },
    };
  } catch (error) {
    console.error('Error parsing DICOM metadata:', error);
    return null;
  }
};

// DICOM upload endpoint
app.post('/api/dicom/upload', authenticateToken, upload.array('dicomFiles'), async (req, res) => {
  req.setTimeout(300000); // 5 minutes timeout

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const uploadResults = [];
    const errors = [];
    let firstValidMetadata = null;
    const seriesMap = new Map(); // Map to group files by Series Instance UID

    const t = await sequelize.transaction();

    try {
      // Group files by Series Instance UID
      for (const file of req.files) {
        const metadata = await parseDicomMetadata(file.path);
        if (!metadata) {
          errors.push({ filename: file.originalname, error: 'Invalid DICOM file' });
          await fs.unlink(file.path).catch((err) => console.error(`Failed to delete file ${file.path}:`, err));
          continue;
        }

        if (!metadata.studyInstanceUID || !metadata.seriesInstanceUID || !metadata.sopInstanceUID || !metadata.patientID) {
          errors.push({ filename: file.originalname, error: 'Missing required DICOM metadata (studyInstanceUID, seriesInstanceUID, sopInstanceUID, or patientID)' });
          await fs.unlink(file.path).catch((err) => console.error(`Failed to delete file ${file.path}:`, err));
          continue;
        }

        // Check for existing SOP Instance UID
        const existingInstance = await models.Instance.findOne({
          where: { sopInstanceUID: metadata.sopInstanceUID },
          transaction: t,
        });
        if (existingInstance) {
          errors.push({ filename: file.originalname, error: `File with SOP Instance UID ${metadata.sopInstanceUID} already exists` });
          await fs.unlink(file.path).catch((err) => console.error(`Failed to delete duplicate file ${file.path}:`, err));
          continue;
        }

        // Store metadata from the first valid DICOM file for autofill
        if (!firstValidMetadata) {
          firstValidMetadata = {
            patientName: metadata.patientName,
            patientID: metadata.patientID,
            patientBirthDate: metadata.patientBirthDate,
            patientSex: metadata.patientSex,
            studyID: metadata.studyID,
            studyDate: metadata.studyDate,
            studyTime: metadata.studyTime,
            studyDescription: metadata.studyDescription,
            modality: metadata.modality,
            bodyPartExamined: metadata.bodyPartExamined,
          };
        }

        // Group files by seriesInstanceUID
        if (!seriesMap.has(metadata.seriesInstanceUID)) {
          seriesMap.set(metadata.seriesInstanceUID, {
            studyInstanceUID: metadata.studyInstanceUID,
            modality: metadata.modality,
            seriesDescription: metadata.seriesDescription || '',
            files: [],
          });
        }
        seriesMap.get(metadata.seriesInstanceUID).files.push({ file, metadata });
      }

      // Process each series
      for (const [seriesInstanceUID, seriesData] of seriesMap) {
        const { studyInstanceUID, modality, seriesDescription, files } = seriesData;

        // Verify all files in the series have the same Study Instance UID
        const consistentStudyUID = files.every(fileData => fileData.metadata.studyInstanceUID === studyInstanceUID);
        if (!consistentStudyUID) {
          errors.push({ seriesInstanceUID, message: 'Inconsistent Study Instance UID detected for files in the same series' });
          for (const { file } of files) {
            await fs.unlink(file.path).catch((err) => console.error(`Failed to delete file ${file.path} due to study mismatch:`, err));
          }
          continue;
        }

        // Find or create Patient
        const patient = await models.Patient.findOne({
          where: { patientID: files[0].metadata.patientID },
          transaction: t,
        }) || await models.Patient.create({
          patientID: files[0].metadata.patientID,
          patientName: files[0].metadata.patientName,
          patientBirthDate: files[0].metadata.patientBirthDate,
          patientSex: files[0].metadata.patientSex,
          createdAt: new Date(),
          updatedAt: new Date(),
        }, { transaction: t });

        // Find or create Study
        let study = await models.Study.findOne({
          where: { studyInstanceUID },
          transaction: t,
        });
        if (!study) {
          study = await models.Study.create({
            patientId: patient.id,
            studyInstanceUID,
            studyID: files[0].metadata.studyID,
            studyDate: files[0].metadata.studyDate,
            studyTime: files[0].metadata.studyTime,
            studyDescription: files[0].metadata.studyDescription,
            modalitiesInStudy: [modality].filter(Boolean),
            createdAt: new Date(),
            updatedAt: new Date(),
          }, { transaction: t });
        }

        // Check if Series exists
        let series = await models.Series.findOne({
          where: { seriesInstanceUID },
          transaction: t,
        });

        if (series) {
          // Series exists, notify user and process files under existing series
          errors.push({ seriesInstanceUID, message: 'This Series already exists in PACS.' });
        } else {
          // Create new Series
          series = await models.Series.create({
            studyId: study.id,
            seriesInstanceUID,
            seriesNumber: files[0].metadata.seriesNumber,
            seriesDate: files[0].metadata.seriesDate,
            seriesTime: files[0].metadata.seriesTime,
            seriesDescription,
            modality,
            bodyPartExamined: files[0].metadata.bodyPartExamined,
            createdAt: new Date(),
            updatedAt: new Date(),
          }, { transaction: t });

          await models.Study.update(
            { numberOfSeries: sequelize.literal('numberOfSeries + 1') },
            { where: { id: study.id }, transaction: t }
          );
        }

        // Process each file in the series
        for (const { file, metadata } of files) {
          // Verify Study Instance UID matches (redundant check for consistency)
          if (metadata.studyInstanceUID !== study.studyInstanceUID) {
            errors.push({
              filename: file.originalname,
              error: `Study Instance UID ${metadata.studyInstanceUID} does not match the Study ${study.studyInstanceUID}`,
            });
            await fs.unlink(file.path).catch((err) => console.error(`Failed to delete file ${file.path}:`, err));
            continue;
          }

          // Check for existing instance (already handled above, but kept for safety)
          let instance = await models.Instance.findOne({
            where: { sopInstanceUID: metadata.sopInstanceUID },
            transaction: t,
          });

          if (instance) {
            // Update existing instance
            await models.Instance.update(
              {
                seriesId: series.id,
                instanceNumber: metadata.instanceNumber,
                fileKey: file.filename,
                updatedAt: new Date(),
              },
              { where: { sopInstanceUID: metadata.sopInstanceUID }, transaction: t }
            );
            // Delete the old file if it exists
            const oldDicomFile = await models.DicomFile.findOne({
              where: { sopInstanceUID: metadata.sopInstanceUID },
              transaction: t,
            });
            if (oldDicomFile && oldDicomFile.filePath) {
              await fs.unlink(oldDicomFile.filePath).catch((err) => console.error(`Failed to delete old file ${oldDicomFile.filePath}:`, err));
            }
          } else {
            // Create new instance
            instance = await models.Instance.create({
              seriesId: series.id,
              sopInstanceUID: metadata.sopInstanceUID,
              instanceNumber: metadata.instanceNumber,
              fileKey: file.filename,
              createdAt: new Date(),
              updatedAt: new Date(),
            }, { transaction: t });
          }

          // Update or create DicomFile record
          await models.DicomFile.upsert({
            patientId: patient.id,
            studyId: study.id,
            seriesId: series.id,
            sopInstanceUID: metadata.sopInstanceUID,
            sopClassUID: metadata.sopClassUID,
            transferSyntaxUID: metadata.transferSyntaxUID,
            filename: file.filename,
            originalFilename: file.originalname,
            filePath: file.path,
            fileSize: file.size,
            instanceNumber: metadata.instanceNumber,
            imageType: metadata.imageType ? metadata.imageType.split('\\') : [],
            photometricInterpretation: metadata.photometricInterpretation,
            rows: metadata.rows,
            columns: metadata.columns,
            bitsAllocated: metadata.bitsAllocated,
            bitsStored: metadata.bitsStored,
            highBit: metadata.highBit,
            pixelRepresentation: metadata.pixelRepresentation,
            samplesPerPixel: metadata.samplesPerPixel,
            imageDate: metadata.imageDate,
            imageTime: metadata.imageTime,
            acquisitionDate: metadata.acquisitionDate,
            acquisitionTime: metadata.acquisitionTime,
            windowCenter: metadata.windowCenter ? metadata.windowCenter.split('\\').map(Number) : [],
            windowWidth: metadata.windowWidth ? metadata.windowWidth.split('\\').map(Number) : [],
            pixelSpacing: metadata.pixelSpacing ? metadata.pixelSpacing.split('\\').map(Number) : [],
            sliceThickness: metadata.sliceThickness,
            sliceLocation: metadata.sliceLocation,
            imagePosition: metadata.imagePosition ? metadata.imagePosition.split('\\').map(Number) : [],
            imageOrientation: metadata.imageOrientation ? metadata.imageOrientation.split('\\').map(Number) : [],
            processingStatus: 'completed',
            metadata: {
              patientName: metadata.patientName,
              studyDescription: metadata.studyDescription,
              seriesDescription: metadata.seriesDescription,
              modality: metadata.modality,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          }, { transaction: t });

          // Update counts if new instance
          if (!instance.isNewRecord) {
            console.log(`Updated existing instance with SOP Instance UID ${metadata.sopInstanceUID}`);
            uploadResults.push({
              filename: file.originalname,
              sopInstanceUID: metadata.sopInstanceUID,
              studyInstanceUID: metadata.studyInstanceUID,
              seriesInstanceUID: metadata.seriesInstanceUID,
              status: 'updated',
            });
          } else {
            await models.Series.update(
              { numberOfInstances: sequelize.literal('numberOfInstances + 1') },
              { where: { id: series.id }, transaction: t }
            );
            await models.Study.update(
              { numberOfInstances: sequelize.literal('numberOfInstances + 1') },
              { where: { id: study.id }, transaction: t }
            );
            await models.Patient.update(
              {
                totalStudies: sequelize.literal(`totalStudies + ${study.isNewRecord ? 1 : 0}`),
                totalSeries: sequelize.literal(`totalSeries + ${series.isNewRecord ? 1 : 0}`),
                totalInstances: sequelize.literal('totalInstances + 1'),
                updatedAt: new Date(),
              },
              { where: { id: patient.id }, transaction: t }
            );
            uploadResults.push({
              filename: file.originalname,
              sopInstanceUID: metadata.sopInstanceUID,
              studyInstanceUID: metadata.studyInstanceUID,
              seriesInstanceUID: metadata.seriesInstanceUID,
              status: 'created',
            });
          }
        }
      }

      await t.commit();
      return res.json({
        success: uploadResults.length > 0,
        message: `Processed ${uploadResults.length} files successfully (${uploadResults.filter(r => r.status === 'created').length} created, ${uploadResults.filter(r => r.status === 'updated').length} updated)`,
        uploadResults,
        metadata: firstValidMetadata,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      await t.rollback();
      console.error('Upload endpoint error:', error);
      return res.status(500).json({ success: false, message: `Server error during upload: ${error.message}`, errors });
    }
  } catch (error) {
    console.error('Upload endpoint error:', error);
    return res.status(500).json({ success: false, message: `Server error during upload: ${error.message}` });
  }
});

// Create study endpoint
app.post('/api/dicom/study/create', authenticateToken, async (req, res) => {
  const {
    patientName,
    patientID,
    patientBirthDate,
    patientSex,
    patientPhone,
    patientEmail,
    patientAddress,
    studyID,
    studyDate,
    studyTime,
    studyDescription,
    modality,
    accessionNumber,
    bodyPartExamined,
    referringPhysician,
    studyPriority,
    studyStatus,
    comments,
    dicomFileIds,
  } = req.body;

  if (!patientName || !patientID) {
    return res.status(400).json({ success: false, message: 'Patient Name and Patient ID are required' });
  }

  const t = await sequelize.transaction();

  try {
    let patient = await models.Patient.findOne({
      where: { patientID },
      transaction: t,
    });

    if (!patient) {
      patient = await models.Patient.create({
        patientID,
        patientName,
        patientBirthDate: patientBirthDate ? new Date(patientBirthDate) : null,
        patientSex: patientSex || '',
        patientPhone: patientPhone || '',
        patientEmail: patientEmail || '',
        patientAddress: patientAddress || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { transaction: t });
    }

    const studyInstanceUID = `1.2.840.10008.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;

    const study = await models.Study.create({
      patientId: patient.id,
      studyInstanceUID,
      studyID: studyID || `STU${Date.now().toString().slice(-6)}${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      studyDate: studyDate ? new Date(studyDate) : new Date(),
      studyTime: studyTime || new Date().toTimeString().split(' ')[0].slice(0, 5),
      studyDescription: studyDescription || '',
      modalitiesInStudy: modality ? [modality] : [],
      accessionNumber: accessionNumber || `ACC${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      bodyPartExamined: bodyPartExamined || '',
      referringPhysician: referringPhysician || '',
      studyPriority: studyPriority || 'routine',
      studyStatus: studyStatus || 'scheduled',
      comments: comments || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }, { transaction: t });

    // Associate uploaded DICOM files with the study
    if (dicomFileIds && Array.isArray(dicomFileIds) && dicomFileIds.length > 0) {
      const dicomFiles = await models.DicomFile.findAll({
        where: { sopInstanceUID: { [Op.in]: dicomFileIds } },
        transaction: t,
      });

      for (const dicomFile of dicomFiles) {
        const instance = await models.Instance.findOne({
          where: { sopInstanceUID: dicomFile.sopInstanceUID },
          transaction: t,
        });

        if (instance) {
          const series = await models.Series.findByPk(instance.seriesId, { transaction: t });
          if (series) {
            await series.update({ studyId: study.id }, { transaction: t });
            await dicomFile.update({ studyId: study.id }, { transaction: t });

            // Update counts
            await models.Study.update(
              {
                numberOfSeries: sequelize.literal('numberOfSeries + 1'),
                numberOfInstances: sequelize.literal('numberOfInstances + 1'),
              },
              { where: { id: study.id }, transaction: t }
            );
            await models.Series.update(
              { numberOfInstances: sequelize.literal('numberOfInstances + 1') },
              { where: { id: series.id }, transaction: t }
            );
          }
        }
      }

      await models.Patient.update(
        {
          totalStudies: sequelize.literal('totalStudies + 1'),
          totalSeries: sequelize.literal(`totalSeries + ${dicomFiles.length}`),
          totalInstances: sequelize.literal(`totalInstances + ${dicomFiles.length}`),
          updatedAt: new Date(),
        },
        { where: { id: patient.id }, transaction: t }
      );
    }

    await t.commit();

    const transformedStudy = {
      id: study.id,
      patientName: patient.patientName,
      patientID: patient.patientID,
      patientBirthDate: patient.patientBirthDate,
      patientSex: patient.patientSex,
      patientPhone: patient.patientPhone,
      patientEmail: patient.patientEmail,
      patientAddress: patient.patientAddress,
      studyID: study.studyID,
      studyDate: study.studyDate,
      studyTime: study.studyTime,
      studyDescription: study.studyDescription,
      modality: study.modalitiesInStudy ? study.modalitiesInStudy[0] : '',
      accessionNumber: study.accessionNumber,
      bodyPartExamined: study.bodyPartExamined,
      referringPhysician: study.referringPhysician,
      studyPriority: study.studyPriority,
      studyStatus: study.studyStatus,
      comments: study.comments,
    };

    return res.json({ success: true, message: 'Study created successfully', study: transformedStudy });
  } catch (error) {
    await t.rollback();
    console.error('Error creating study:', error);
    return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Update study endpoint
app.put('/api/dicom/study/:studyId', authenticateToken, async (req, res) => {
  const { studyId } = req.params;
  const {
    patientName,
    patientID,
    patientBirthDate,
    patientSex,
    patientPhone,
    patientEmail,
    patientAddress,
    studyID,
    studyDate,
    studyTime,
    studyDescription,
    modality,
    accessionNumber,
    bodyPartExamined,
    referringPhysician,
    studyPriority,
    studyStatus,
    comments,
    dicomFileIds,
  } = req.body;

  if (!patientName || !patientID) {
    return res.status(400).json({ success: false, message: 'Patient Name and Patient ID are required' });
  }

  const t = await sequelize.transaction();

  try {
    const study = await models.Study.findByPk(studyId, {
      include: [{ model: models.Patient, as: 'Patient' }],
      transaction: t,
    });

    if (!study) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Study not found' });
    }

    let patient = await models.Patient.findOne({
      where: { patientID },
      transaction: t,
    });

    if (!patient) {
      patient = await models.Patient.create({
        patientID,
        patientName,
        patientBirthDate: patientBirthDate ? new Date(patientBirthDate) : null,
        patientSex: patientSex || '',
        patientPhone: patientPhone || '',
        patientEmail: patientEmail || '',
        patientAddress: patientAddress || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { transaction: t });
    } else {
      await patient.update({
        patientName,
        patientBirthDate: patientBirthDate ? new Date(patientBirthDate) : null,
        patientSex: patientSex || '',
        patientPhone: patientPhone || '',
        patientEmail: patientEmail || '',
        patientAddress: patientAddress || '',
        updatedAt: new Date(),
      }, { transaction: t });
    }

    await study.update({
      patientId: patient.id,
      studyID: studyID || study.studyID,
      studyDate: studyDate ? new Date(studyDate) : study.studyDate,
      studyTime: studyTime || study.studyTime,
      studyDescription: studyDescription || study.studyDescription,
      modalitiesInStudy: modality ? [modality] : study.modalitiesInStudy,
      accessionNumber: accessionNumber || study.accessionNumber,
      bodyPartExamined: bodyPartExamined || study.bodyPartExamined,
      referringPhysician: referringPhysician || study.referringPhysician,
      studyPriority: studyPriority || study.studyPriority,
      studyStatus: studyStatus || study.studyStatus,
      comments: comments || study.comments,
      updatedAt: new Date(),
    }, { transaction: t });

    // Update associations with DICOM files
    if (dicomFileIds && Array.isArray(dicomFileIds) && dicomFileIds.length > 0) {
      const dicomFiles = await models.DicomFile.findAll({
        where: { sopInstanceUID: { [Op.in]: dicomFileIds } },
        transaction: t,
      });

      for (const dicomFile of dicomFiles) {
        const instance = await models.Instance.findOne({
          where: { sopInstanceUID: dicomFile.sopInstanceUID },
          transaction: t,
        });

        if (instance) {
          const series = await models.Series.findByPk(instance.seriesId, { transaction: t });
          if (series) {
            await series.update({ studyId: study.id }, { transaction: t });
            await dicomFile.update({ studyId: study.id }, { transaction: t });

            // Update counts if not already associated
            const isNewAssociation = series.studyId !== study.id;
            if (isNewAssociation) {
              await models.Study.update(
                {
                  numberOfSeries: sequelize.literal('numberOfSeries + 1'),
                  numberOfInstances: sequelize.literal('numberOfInstances + 1'),
                },
                { where: { id: study.id }, transaction: t }
              );
              await models.Series.update(
                { numberOfInstances: sequelize.literal('numberOfInstances + 1') },
                { where: { id: series.id }, transaction: t }
              );
            }
          }
        }
      }

      await models.Patient.update(
        {
          totalStudies: sequelize.literal('totalStudies + 1'),
          totalSeries: sequelize.literal(`totalSeries + ${dicomFiles.length}`),
          totalInstances: sequelize.literal(`totalInstances + ${dicomFiles.length}`),
          updatedAt: new Date(),
        },
        { where: { id: patient.id }, transaction: t }
      );
    }

    await t.commit();

    const transformedStudy = {
      id: study.id,
      patientName: patient.patientName,
      patientID: patient.patientID,
      patientBirthDate: patient.patientBirthDate,
      patientSex: patient.patientSex,
      patientPhone: patient.phone,
      patientEmail: patient.email,
      patientAddress: patient.address,
      studyID: study.studyID,
      studyDate: study.studyDate,
      studyTime: study.studyTime,
      studyDescription: study.studyDescription,
      modality: study.modalitiesInStudy ? study.modalitiesInStudy[0] : '',
      accessionNumber: study.accessionNumber,
      bodyPartExamined: study.bodyPartExamined,
      referringPhysician: study.referringPhysician,
      studyPriority: study.studyPriority,
      studyStatus: study.studyStatus,
      comments: study.comments,
    };

    return res.json({ success: true, message: 'Study updated successfully', study: transformedStudy });
  } catch (error) {
    await t.rollback();
    console.error('Error updating study:', error);
    return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Signup endpoint
app.post('/api/auth/signup', async (req, res) => {
  const {
    username,
    email,
    password,
    role,
    firstName,
    lastName,
    phone,
    dateOfBirth,
    gender,
    avatarUrl,
    department,
    twoFactorEnabled,
  } = req.body;

  if (!username || !email || !password || !firstName || !lastName) {
    return res.status(400).json({
      success: false,
      message: 'Required fields are missing',
      errors: [
        !username && { path: 'username', msg: 'Username is required' },
        !email && { path: 'email', msg: 'Email is required' },
        !password && { path: 'password', msg: 'Password is required' },
        !firstName && { path: 'firstName', msg: 'First name is required' },
        !lastName && { path: 'lastName', msg: 'Last name is required' },
      ].filter(Boolean),
    });
  }

  try {
    const existingUser = await models.User.findOne({
      where: {
        [Op.or]: [{ email }, { username }],
      },
    });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email or username already exists',
        errors: [
          existingUser.email === email && { path: 'email', msg: 'Email already exists' },
          existingUser.username === username && { path: 'username', msg: 'Username already exists' },
        ].filter(Boolean),
      });
    }

    let twoFactorSecret = null;
    if (twoFactorEnabled) {
      const secret = speakeasy.generateSecret({ length: 20 });
      twoFactorSecret = secret.base32;
    }

    const user = await models.User.create({
      username,
      email,
      password,
      role: role || 'doctor',
      firstName,
      lastName,
      phone: phone || '',
      department: department || '',
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender: gender || 'prefer-not-to-say',
      avatarUrl: avatarUrl || '',
      twoFactorEnabled: twoFactorEnabled || false,
      twoFactorSecret,
      isActive: true,
    });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });

    const userData = {
      _id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        department: user.department,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        avatarUrl: user.avatarUrl,
      },
    };

    return res.json({ success: true, token, user: userData });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ success: false, message: `Server error during signup: ${error.message}` });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    await user.update({ lastLogin: new Date() });
    await sendLoginNotification(user.email, user.username);

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });

    const userData = {
      _id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        department: user.department,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        avatarUrl: user.avatarUrl,
      },
    };

    return res.json({ success: true, token, user: userData });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Notify login endpoint
app.post('/api/auth/notify-login', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    console.log(`Sending login notification for user: ${email}`);
    return res.json({ success: true, message: 'Notifications sent' });
  } catch (error) {
    console.error('Notify login error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send notifications' });
  }
});

// Fetch study details
app.get('/api/dicom/study/:studyId', authenticateToken, async (req, res) => {
  try {
    const { studyId } = req.params;
    const study = await models.Study.findByPk(studyId, {
      include: [{ model: models.Patient, as: 'Patient' }],
    });
    if (!study) {
      return res.status(404).json({ success: false, message: 'Study not found' });
    }

    const seriesList = await models.Series.findAll({ where: { studyId } });
    const fullSeries = await Promise.all(seriesList.map(async (series) => {
      const instances = await models.Instance.findAll({ where: { seriesId: series.id } });
      const fullInstances = await Promise.all(instances.map(async (inst) => {
        const dicomFile = await models.DicomFile.findOne({ where: { sopInstanceUID: inst.sopInstanceUID } });
        return {
          ...inst.toJSON(),
          filePath: dicomFile ? `/Uploads/dicom/${dicomFile.filename}` : null,
          originalFilename: dicomFile ? dicomFile.originalFilename : null,
        };
      }));
      return {
        ...series.toJSON(),
        id: series.id,
        instances: fullInstances,
      };
    }));

    const transformedStudy = {
      id: study.id,
      patientName: study.Patient ? study.Patient.patientName || 'Unknown' : 'Unknown',
      patientID: study.Patient ? study.Patient.patientID || 'Unknown' : 'Unknown',
      studyDate: study.studyDate,
      studyTime: study.studyTime,
      modality: study.modalitiesInStudy ? study.modalitiesInStudy.join(', ') : '',
      studyDescription: study.studyDescription,
      accessionNumber: study.accessionNumber || '',
      series: fullSeries,
    };

    res.json({ success: true, study: transformedStudy });
  } catch (error) {
    console.error('Error fetching study details:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Fetch studies with filtering and pagination
app.get('/api/dicom/studies', authenticateToken, async (req, res) => {
  try {
    const {
      patientName,
      patientID,
      studyDate,
      modality,
      accessionNumber,
      page = 1,
      limit = 50,
    } = req.query;

    const where = {};
    if (patientName) {
      where['$Patient.patientName$'] = { [Op.like]: `%${patientName}%` };
    }
    if (patientID) {
      where['$Patient.patientID$'] = { [Op.like]: `%${patientID}%` };
    }
    if (studyDate) {
      const startDate = new Date(studyDate);
      const endDate = new Date(studyDate);
      endDate.setDate(endDate.getDate() + 1);
      where.studyDate = { [Op.between]: [startDate, endDate] };
    }
    if (modality) {
      where.modalitiesInStudy = { [Op.contains]: [modality] };
    }
    if (accessionNumber) {
      where.accessionNumber = { [Op.like]: `%${accessionNumber}%` };
    }

    let orderClause = [['studyDate', 'DESC']];
    try {
      await models.Patient.findOne({ attributes: ['patientName'] });
      orderClause.push([{ model: models.Patient, as: 'Patient' }, 'patientName', 'ASC']);
    } catch (error) {
      console.warn('Warning: patientName column not found, falling back to studyDate ordering only', error.message);
    }

    const studies = await models.Study.findAndCountAll({
      where,
      include: [
        { model: models.Patient, as: 'Patient', required: true },
        { model: models.Series, as: 'Series', required: false },
      ],
      order: orderClause,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    const transformedStudies = studies.rows.map((study) => ({
      id: study.id,
      patientName: study.Patient ? study.Patient.patientName || 'Unknown' : 'Unknown',
      patientID: study.Patient ? study.Patient.patientID || 'Unknown' : 'Unknown',
      studyDate: study.studyDate,
      studyTime: study.studyTime,
      modality: study.modalitiesInStudy ? study.modalitiesInStudy[0] || 'Unknown' : 'Unknown',
      studyDescription: study.studyDescription,
      accessionNumber: study.accessionNumber || '',
      studyInstanceUID: study.studyInstanceUID,
      numberOfSeries: study.numberOfSeries,
      numberOfImages: study.numberOfInstances,
      series: study.Series ? study.Series.map((series) => ({
        id: series.id,
        seriesNumber: series.seriesNumber,
        seriesDescription: series.seriesDescription,
        modality: series.modality,
        seriesInstanceUID: series.seriesInstanceUID,
        numberOfInstances: series.numberOfInstances,
        instances: [],
      })) : [],
    }));

    res.json({
      success: true,
      studies: transformedStudies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: studies.count,
      },
    });
  } catch (error) {
    console.error('Error fetching studies:', error);
    res.status(500).json({ success: false, message: `Error fetching studies: ${error.message}` });
  }
});

// General error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: `Server error: ${err.message}` });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
})