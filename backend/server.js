import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import User from './models/User.js';
import DicomFile from './models/DicomFile.js';
import Study from './models/Study.js';
import Series from './models/Series.js';
import Instance from './models/Instance.js';
import Patient from './models/Patient.js';
import { config as dotenvConfig } from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dicomParser from 'dicom-parser';
import speakeasy from 'speakeasy';
import nodemailer from 'nodemailer';

// ES6 module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();

// Load environment variables
dotenvConfig();
if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
  console.error('❌ Missing required environment variables: JWT_SECRET or MONGODB_URI');
  process.exit(1);
}

// Check for email credentials
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn('⚠️ Email credentials (EMAIL_USER or EMAIL_PASS) not set. Email notifications will be disabled.');
}

// Create uploads directory
const uploadsDir = path.join(__dirname, 'Uploads', 'dicom');
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Created uploads directory:', uploadsDir);
  } catch (err) {
    console.error('❌ Failed to create uploads directory:', err);
    process.exit(1);
  }
}

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '100mb' })); // Increase JSON payload limit
app.use(express.urlencoded({ extended: true, limit: '100mb' })); // Increase URL-encoded payload limit
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
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

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};
connectDB();

// Email transporter setup (conditional on credentials)
const transporter = (process.env.EMAIL_USER && process.env.EMAIL_PASS) ? nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Note: For Gmail, this should be an App Password if 2-Step Verification is enabled. See: https://support.google.com/accounts/answer/185833 for instructions on generating an App Password.
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
    text: `Dear ${username},

You have successfully logged in to our system on ${new Date().toLocaleString()}.

If this wasn't you, please secure your account immediately.

Best regards,
Your App Team`,
    html: `<p>Dear ${username},</p>
<p>You have successfully logged in to our system on ${new Date().toLocaleString()}.</p>
<p>If this wasn't you, please secure your account immediately.</p>
<p>Best regards,<br>Your App Team</p>`, // Added HTML version to improve deliverability and reduce spam risk
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Login notification sent to ' + email);
  } catch (error) {
    console.error('Error sending login notification to ' + email + ':', error);
  }
};

// Parse DICOM metadata with async file reading
const parseDicomMetadata = async (filePath) => {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    const byteArray = new Uint8Array(fileBuffer);
    const dataSet = dicomParser.parseDicom(byteArray, { untilTag: 'x7fe00010' }); // Stop before pixel data

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

// DICOM upload endpoint with no file limit
app.post('/api/dicom/upload', authenticateToken, upload.array('dicomFiles'), async (req, res) => {
  req.setTimeout(300000); // 5 minutes timeout

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const uploadResults = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const metadata = await parseDicomMetadata(file.path);
        if (!metadata) {
          errors.push({ filename: file.originalname, error: 'Invalid DICOM file' });
          await fs.promises.unlink(file.path).catch((err) => console.error(`Failed to delete file ${file.path}:`, err));
          continue;
        }

        if (!metadata.studyInstanceUID || !metadata.patientID || !metadata.seriesInstanceUID || !metadata.sopInstanceUID) {
          errors.push({ filename: file.originalname, error: 'Missing required DICOM metadata (studyInstanceUID, patientID, seriesInstanceUID, or sopInstanceUID)' });
          await fs.promises.unlink(file.path).catch((err) => console.error(`Failed to delete file ${file.path}:`, err));
          continue;
        }

        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            // Find or create Patient
            let patient = await Patient.findOne({ patientID: metadata.patientID }).session(session);
            if (!patient) {
              patient = new Patient({
                patientID: metadata.patientID,
                patientName: metadata.patientName,
                patientBirthDate: metadata.patientBirthDate,
                patientSex: metadata.patientSex,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              await patient.save({ session });
            }

            // Find or create Study
            let study = await Study.findOne({ studyInstanceUID: metadata.studyInstanceUID }).session(session);
            if (!study) {
              study = new Study({
                patient: patient._id,
                studyInstanceUID: metadata.studyInstanceUID,
                studyID: metadata.studyID,
                studyDate: metadata.studyDate,
                studyTime: metadata.studyTime,
                studyDescription: metadata.studyDescription,
                modalitiesInStudy: [metadata.modality].filter(Boolean),
                numberOfSeries: 0,
                numberOfInstances: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              await study.save({ session });
            }

            // Find or create Series
            let series = await Series.findOne({ seriesInstanceUID: metadata.seriesInstanceUID }).session(session);
            if (!series) {
              series = new Series({
                study: study._id,
                seriesInstanceUID: metadata.seriesInstanceUID,
                seriesNumber: metadata.seriesNumber,
                seriesDate: metadata.seriesDate,
                seriesTime: metadata.seriesTime,
                seriesDescription: metadata.seriesDescription,
                modality: metadata.modality,
                bodyPartExamined: metadata.bodyPartExamined,
                numberOfInstances: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              await series.save({ session });

              await Study.findByIdAndUpdate(
                study._id,
                { $inc: { numberOfSeries: 1 } },
                { session }
              );
            }

            // Check for existing instance
            const existingInstance = await Instance.findOne({ sopInstanceUID: metadata.sopInstanceUID }).session(session);
            if (existingInstance) {
              throw new Error(`Instance with SOP Instance UID ${metadata.sopInstanceUID} already exists`);
            }

            // Create Instance record
            const instance = new Instance({
              series: series._id,
              sopInstanceUID: metadata.sopInstanceUID,
              instanceNumber: metadata.instanceNumber,
              fileKey: file.filename,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            await instance.save({ session });

            // Create DicomFile record
            const dicomFile = new DicomFile({
              patient: patient._id,
              study: study._id,
              series: series._id,
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
            });

            await dicomFile.save({ session });

            // Update counts
            await Series.findByIdAndUpdate(
              series._id,
              { $inc: { numberOfInstances: 1 } },
              { session }
            );
            await Study.findByIdAndUpdate(
              study._id,
              { $inc: { numberOfInstances: 1 } },
              { session }
            );
            await Patient.findByIdAndUpdate(
              patient._id,
              {
                $inc: {
                  totalStudies: study.isNew ? 1 : 0,
                  totalSeries: series.isNew ? 1 : 0,
                  totalInstances: 1,
                },
                updatedAt: new Date(),
              },
              { session }
            );

            uploadResults.push({
              filename: file.originalname,
              sopInstanceUID: metadata.sopInstanceUID,
              studyInstanceUID: metadata.studyInstanceUID,
              seriesInstanceUID: metadata.seriesInstanceUID,
              status: 'success',
            });
          });
        } catch (error) {
          console.error(`Error processing file ${file.originalname}:`, error);
          errors.push({ filename: file.originalname, error: error.message });
          await fs.promises.unlink(file.path).catch((err) => console.error(`Failed to delete file ${file.path}:`, err));
        } finally {
          session.endSession();
        }
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        errors.push({ filename: file.originalname, error: error.message });
        await fs.promises.unlink(file.path).catch((err) => console.error(`Failed to delete file ${file.path}:`, err));
      }
    }

    return res.json({
      success: uploadResults.length > 0,
      message: `Processed ${uploadResults.length} files successfully`,
      uploadResults,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Upload endpoint error:', error);
    return res.status(500).json({ success: false, message: `Server error during upload: ${error.message}` });
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
    return res.status(400).json({ success: false, message: 'Required fields are missing' });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email or username already exists' });
    }

    let twoFactorSecret = null;
    if (twoFactorEnabled) {
      const secret = speakeasy.generateSecret({ length: 20 });
      twoFactorSecret = secret.base32;
    }

    const profile = {
      firstName,
      lastName,
      phone: phone || '',
      department: department || '',
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender: gender || 'prefer-not-to-say',
      avatarUrl: avatarUrl || '',
    };

    const user = new User({
      username,
      email,
      password, // Will be hashed in pre-save hook
      role: role || 'doctor',
      profile,
      twoFactorEnabled: twoFactorEnabled || false,
      twoFactorSecret,
      isActive: true,
    });

    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });

    const userData = {
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      profile: user.profile,
    };

    return res.json({ success: true, token, user: userData });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ success: false, message: 'Server error during signup' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    // Update lastLogin
    user.lastLogin = Date.now();
    await user.save();

    // Send login notification (if configured)
    await sendLoginNotification(user.email, user.username);

    // Generate token (expires in 30 days to match potential remember options, but adjust as needed)
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });

    // Prepare user data
    const userData = {
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      profile: user.profile,
    };

    return res.json({ success: true, token, user: userData });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Notify login endpoint (placeholder - add actual email sending logic if needed, e.g., using nodemailer)
app.post('/api/auth/notify-login', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    // Placeholder for sending notifications (e.g., to admin and user)
    console.log(`Sending login notification for user: ${email}`);
    // TODO: Integrate email service like nodemailer here
    // Example: await sendEmail(adminEmail, 'Login Notification', `User ${email} has logged in.`);
    // await sendEmail(email, 'Login Confirmation', 'You have successfully logged in.');

    return res.json({ success: true, message: 'Notifications sent' });
  } catch (error) {
    console.error('Notify login error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send notifications' });
  }
});

// Fetch full study details with series and instances
app.get('/api/dicom/study/:studyId', authenticateToken, async (req, res) => {
  try {
    const { studyId } = req.params;
    const study = await Study.findById(studyId).populate('patient');
    if (!study) {
      return res.status(404).json({ success: false, message: 'Study not found' });
    }
    const seriesList = await Series.find({ study: studyId });
    const fullSeries = await Promise.all(seriesList.map(async (series) => {
      const instances = await Instance.find({ series: series._id });
      const fullInstances = await Promise.all(instances.map(async (inst) => {
        const dicomFile = await DicomFile.findOne({ sopInstanceUID: inst.sopInstanceUID });
        return {
          ...inst.toObject(),
          filePath: dicomFile ? `/uploads/dicom/${dicomFile.filename}` : null,
          originalFilename: dicomFile ? dicomFile.originalFilename : null,
        };
      }));
      return {
        ...series.toObject(),
        id: series._id,
        instances: fullInstances,
      };
    }));
    const transformedStudy = {
      id: study._id,
      patientName: study.patient.patientName,
      patientID: study.patient.patientID,
      studyDate: study.studyDate,
      studyTime: study.studyTime,
      modality: study.modalitiesInStudy.join(', '),
      studyDescription: study.studyDescription,
      accessionNumber: study.accessionNumber || '',
      series: fullSeries,
    };
    res.json({ success: true, study: transformedStudy });
  } catch (error) {
    console.error('Error fetching study details:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Other routes (same as previous, included for completeness)
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

    const filter = {};
    if (patientName) {
      filter['patient.patientName'] = new RegExp(patientName, 'i');
    }
    if (patientID) {
      filter['patient.patientID'] = new RegExp(patientID, 'i');
    }
    if (studyDate) {
      const startDate = new Date(studyDate);
      const endDate = new Date(studyDate);
      endDate.setDate(endDate.getDate() + 1);
      filter.studyDate = { $gte: startDate, $lt: endDate };
    }
    if (modality) {
      filter.modalitiesInStudy = modality;
    }
    if (accessionNumber) {
      filter.accessionNumber = new RegExp(accessionNumber, 'i');
    }

    const studies = await Study.aggregate([
      {
        $lookup: {
          from: 'patients',
          localField: 'patient',
          foreignField: '_id',
          as: 'patient',
        },
      },
      {
        $unwind: '$patient',
      },
      {
        $match: filter,
      },
      {
        $lookup: {
          from: 'series',
          localField: '_id',
          foreignField: 'study',
          as: 'series',
        },
      },
      {
        $sort: { studyDate: -1, 'patient.patientName': 1 },
      },
      {
        $skip: (page - 1) * parseInt(limit),
      },
      {
        $limit: parseInt(limit),
      },
    ]);

    const transformedStudies = studies.map((study) => ({
      id: study._id,
      patientName: study.patient.patientName,
      patientID: study.patient.patientID,
      studyDate: study.studyDate,
      studyTime: study.studyTime,
      modality: study.modalitiesInStudy[0] || 'Unknown',
      studyDescription: study.studyDescription,
      accessionNumber: study.accessionNumber || '',
      studyInstanceUID: study.studyInstanceUID,
      numberOfSeries: study.numberOfSeries,
      numberOfImages: study.numberOfInstances,
      series: study.series.map((series) => ({
        id: series._id,
        seriesNumber: series.seriesNumber,
        seriesDescription: series.seriesDescription,
        modality: series.modality,
        seriesInstanceUID: series.seriesInstanceUID,
        numberOfInstances: series.numberOfInstances,
        instances: [],
      })),
    }));

    res.json({
      success: true,
      studies: transformedStudies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: studies.length,
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
});