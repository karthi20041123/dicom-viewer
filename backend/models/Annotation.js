// models/Annotation.js
import mongoose from "mongoose";

const annotationSchema = new mongoose.Schema({
  // Reference to the DICOM instance
  sopInstanceUID: { 
    type: String, 
    required: true, 
    index: true 
  },
  
  // Reference to series and study for easier querying
  seriesInstanceUID: { 
    type: String, 
    required: true,
    index: true 
  },
  
  studyInstanceUID: { 
    type: String, 
    required: true,
    index: true 
  },
  
  // User who created the annotation
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Annotation type
  type: {
    type: String,
    enum: [
      'measurement',    // Distance, area, volume measurements
      'arrow',         // Arrow pointing to a feature
      'text',          // Text annotation
      'rectangle',     // Rectangular region
      'ellipse',       // Elliptical region
      'polygon',       // Free-form polygon
      'angle',         // Angle measurement
      'freehand',      // Freehand drawing
      'marker',        // Point marker
      'ruler'          // Calibrated ruler
    ],
    required: true
  },
  
  // Annotation data based on type
  data: {
    // Common properties
    coordinates: [{
      x: { type: Number, required: true },
      y: { type: Number, required: true },
      z: { type: Number, default: 0 } // For 3D annotations
    }],
    
    // Text content for text annotations
    text: String,
    
    // Style properties
    color: { 
      type: String, 
      default: '#ffff00' // Yellow default
    },
    
    lineWidth: { 
      type: Number, 
      default: 2 
    },
    
    fontSize: { 
      type: Number, 
      default: 14 
    },
    
    // Measurement results
    measurement: {
      value: Number,
      unit: { 
        type: String, 
        enum: ['mm', 'cm', 'm', 'px', 'degrees', 'mm²', 'cm²', 'mm³', 'cm³'],
        default: 'mm'
      },
      calibration: {
        pixelSpacing: [Number], // [row, column] spacing in mm
        sliceThickness: Number
      }
    },
    
    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  
  // Instance-specific information
  instanceData: {
    instanceNumber: Number,
    frameNumber: { type: Number, default: 1 }, // For multi-frame images
    windowCenter: Number,
    windowWidth: Number,
    zoom: { type: Number, default: 1 },
    rotation: { type: Number, default: 0 },
    pan: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 }
    }
  },
  
  // Visibility and status
  visible: { 
    type: Boolean, 
    default: true 
  },
  
  locked: { 
    type: Boolean, 
    default: false 
  },
  
  // Approval workflow
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected'],
    default: 'draft'
  },
  
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  approvedAt: Date,
  
  // Comments and review
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Sharing and permissions
  shared: {
    type: Boolean,
    default: false
  },
  
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permission: {
      type: String,
      enum: ['view', 'edit'],
      default: 'view'
    }
  }],
  
  // Versioning
  version: {
    type: Number,
    default: 1
  },
  
  previousVersion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Annotation'
  },
  
  // Audit trail
  auditTrail: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'deleted', 'approved', 'rejected', 'shared'],
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: String
  }],
  
  // Templates and presets
  template: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AnnotationTemplate'
  },
  
  // Tags for categorization
  tags: [String],
  
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true // Automatically manage createdAt and updatedAt
});

// Compound indexes for efficient querying
annotationSchema.index({ studyInstanceUID: 1, createdBy: 1 });
annotationSchema.index({ sopInstanceUID: 1, type: 1 });
annotationSchema.index({ createdBy: 1, createdAt: -1 });
annotationSchema.index({ status: 1, createdAt: -1 });

// Virtual for calculating measurement statistics
annotationSchema.virtual('measurementStats').get(function() {
  if (this.type === 'measurement' && this.data.measurement) {
    return {
      value: this.data.measurement.value,
      unit: this.data.measurement.unit,
      formatted: `${this.data.measurement.value.toFixed(2)} ${this.data.measurement.unit}`
    };
  }
  return null;
});

// Static methods for common queries
annotationSchema.statics.findByStudy = function(studyInstanceUID, options = {}) {
  return this.find({ studyInstanceUID, ...options })
    .populate('createdBy', 'username profile.firstName profile.lastName')
    .populate('approvedBy', 'username profile.firstName profile.lastName')
    .sort({ createdAt: -1 });
};

annotationSchema.statics.findByUser = function(userId, options = {}) {
  return this.find({ createdBy: userId, ...options })
    .populate('createdBy', 'username profile.firstName profile.lastName')
    .sort({ createdAt: -1 });
};

annotationSchema.statics.findPendingApproval = function(options = {}) {
  return this.find({ status: 'pending', ...options })
    .populate('createdBy', 'username profile.firstName profile.lastName')
    .sort({ createdAt: -1 });
};

// Instance methods
annotationSchema.methods.addComment = function(userId, text) {
  this.comments.push({
    user: userId,
    text: text,
    createdAt: new Date()
  });
  return this.save();
};

annotationSchema.methods.approve = function(userId) {
  this.status = 'approved';
  this.approvedBy = userId;
  this.approvedAt = new Date();
  this.auditTrail.push({
    action: 'approved',
    user: userId,
    details: 'Annotation approved'
  });
  return this.save();
};

annotationSchema.methods.reject = function(userId, reason) {
  this.status = 'rejected';
  this.auditTrail.push({
    action: 'rejected',
    user: userId,
    details: reason || 'Annotation rejected'
  });
  return this.save();
};

annotationSchema.methods.shareWith = function(userId, permission = 'view') {
  const existing = this.sharedWith.find(s => s.user.toString() === userId.toString());
  if (existing) {
    existing.permission = permission;
  } else {
    this.sharedWith.push({ user: userId, permission });
  }
  this.shared = this.sharedWith.length > 0;
  return this.save();
};

// Pre-save middleware to update audit trail
annotationSchema.pre('save', function(next) {
  if (this.isNew) {
    this.auditTrail.push({
      action: 'created',
      user: this.createdBy,
      details: `${this.type} annotation created`
    });
  } else if (this.isModified()) {
    this.updatedAt = new Date();
    if (this.updatedBy) {
      this.auditTrail.push({
        action: 'updated',
        user: this.updatedBy,
        details: 'Annotation updated'
      });
    }
  }
  next();
});

// Annotation Template Schema (for reusable annotation templates)
const annotationTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  
  description: String,
  
  type: {
    type: String,
    enum: [
      'measurement', 'arrow', 'text', 'rectangle', 
      'ellipse', 'polygon', 'angle', 'freehand', 'marker', 'ruler'
    ],
    required: true
  },
  
  defaultData: {
    color: { type: String, default: '#ffff00' },
    lineWidth: { type: Number, default: 2 },
    fontSize: { type: Number, default: 14 },
    text: String,
    metadata: mongoose.Schema.Types.Mixed
  },
  
  category: {
    type: String,
    enum: ['general', 'cardiac', 'neurological', 'orthopedic', 'oncology'],
    default: 'general'
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  isPublic: {
    type: Boolean,
    default: false
  },
  
  usageCount: {
    type: Number,
    default: 0
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Annotation Session Schema (for tracking annotation sessions)
const annotationSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  studyInstanceUID: {
    type: String,
    required: true
  },
  
  startTime: {
    type: Date,
    default: Date.now
  },
  
  endTime: Date,
  
  annotationsCreated: {
    type: Number,
    default: 0
  },
  
  annotationsModified: {
    type: Number,
    default: 0
  },
  
  timeSpent: Number, // in minutes
  
  tools: [{
    tool: String,
    usageCount: Number,
    timeSpent: Number
  }],
  
  browserInfo: {
    userAgent: String,
    viewport: {
      width: Number,
      height: Number
    }
  }
});

const Annotation = mongoose.models.Annotation || mongoose.model("Annotation", annotationSchema);
const AnnotationTemplate = mongoose.models.AnnotationTemplate || mongoose.model("AnnotationTemplate", annotationTemplateSchema);
const AnnotationSession = mongoose.models.AnnotationSession || mongoose.model("AnnotationSession", annotationSessionSchema);

export default Annotation;
export { AnnotationTemplate, AnnotationSession };