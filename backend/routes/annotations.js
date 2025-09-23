// routes/annotations.js
import express from "express";
import Annotation, { AnnotationTemplate, AnnotationSession } from "../models/Annotation.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Apply authentication middleware to all annotation routes
router.use(authenticateToken);

// Create new annotation
router.post("/", async (req, res) => {
  try {
    const {
      sopInstanceUID,
      seriesInstanceUID,
      studyInstanceUID,
      type,
      data,
      instanceData,
      tags,
      template
    } = req.body;

    if (!sopInstanceUID || !seriesInstanceUID || !studyInstanceUID || !type || !data) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: sopInstanceUID, seriesInstanceUID, studyInstanceUID, type, data"
      });
    }

    const annotation = new Annotation({
      sopInstanceUID,
      seriesInstanceUID,
      studyInstanceUID,
      type,
      data,
      instanceData,
      tags,
      template,
      createdBy: req.user.id
    });

    await annotation.save();

    // Populate user information
    await annotation.populate('createdBy', 'username profile.firstName profile.lastName');

    // Update template usage count if applicable
    if (template) {
      await AnnotationTemplate.findByIdAndUpdate(template, { $inc: { usageCount: 1 } });
    }

    res.status(201).json({
      success: true,
      message: "Annotation created successfully",
      annotation
    });
  } catch (error) {
    console.error("Create annotation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create annotation"
    });
  }
});

// Get annotations by study
router.get("/study/:studyInstanceUID", async (req, res) => {
  try {
    const { studyInstanceUID } = req.params;
    const { 
      type, 
      status, 
      createdBy, 
      visible,
      limit = 100,
      offset = 0 
    } = req.query;

    let query = { studyInstanceUID };
    
    if (type) query.type = type;
    if (status) query.status = status;
    if (createdBy) query.createdBy = createdBy;
    if (visible !== undefined) query.visible = visible === 'true';

    // Check permissions - users can see their own annotations and shared annotations
    const permissionQuery = {
      $or: [
        { createdBy: req.user.id },
        { shared: true },
        { 'sharedWith.user': req.user.id }
      ]
    };

    const annotations = await Annotation.find({ ...query, ...permissionQuery })
      .populate('createdBy', 'username profile.firstName profile.lastName')
      .populate('approvedBy', 'username profile.firstName profile.lastName')
      .populate('template', 'name category')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await Annotation.countDocuments({ ...query, ...permissionQuery });

    res.json({
      success: true,
      annotations,
      pagination: {
        total,
        offset: parseInt(offset),
        limit: parseInt(limit),
        hasMore: (parseInt(offset) + annotations.length) < total
      }
    });
  } catch (error) {
    console.error("Get annotations by study error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve annotations"
    });
  }
});

// Get annotations by instance
router.get("/instance/:sopInstanceUID", async (req, res) => {
  try {
    const { sopInstanceUID } = req.params;
    const { type, status, visible } = req.query;

    let query = { sopInstanceUID };
    
    if (type) query.type = type;
    if (status) query.status = status;
    if (visible !== undefined) query.visible = visible === 'true';

    // Check permissions
    const permissionQuery = {
      $or: [
        { createdBy: req.user.id },
        { shared: true },
        { 'sharedWith.user': req.user.id }
      ]
    };

    const annotations = await Annotation.find({ ...query, ...permissionQuery })
      .populate('createdBy', 'username profile.firstName profile.lastName')
      .populate('template', 'name category')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      annotations
    });
  } catch (error) {
    console.error("Get annotations by instance error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve annotations"
    });
  }
});

// Get single annotation
router.get("/:id", async (req, res) => {
  try {
    const annotation = await Annotation.findById(req.params.id)
      .populate('createdBy', 'username profile.firstName profile.lastName')
      .populate('approvedBy', 'username profile.firstName profile.lastName')
      .populate('template', 'name category defaultData')
      .populate('comments.user', 'username profile.firstName profile.lastName')
      .populate('sharedWith.user', 'username profile.firstName profile.lastName')
      .populate('auditTrail.user', 'username profile.firstName profile.lastName');

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: "Annotation not found"
      });
    }

    // Check permissions
    const hasAccess = 
      annotation.createdBy._id.toString() === req.user.id ||
      annotation.shared ||
      annotation.sharedWith.some(s => s.user._id.toString() === req.user.id);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    res.json({
      success: true,
      annotation
    });
  } catch (error) {
    console.error("Get annotation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve annotation"
    });
  }
});

// Update annotation
router.put("/:id", async (req, res) => {
  try {
    const annotation = await Annotation.findById(req.params.id);

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: "Annotation not found"
      });
    }

    // Check permissions - only creator or users with edit permission can update
    const canEdit = 
      annotation.createdBy.toString() === req.user.id ||
      annotation.sharedWith.some(s => 
        s.user.toString() === req.user.id && s.permission === 'edit'
      );

    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: "Permission denied"
      });
    }

    if (annotation.locked) {
      return res.status(400).json({
        success: false,
        message: "Annotation is locked and cannot be modified"
      });
    }

    // Update fields
    const updateFields = [
      'data', 'instanceData', 'visible', 'tags', 'status'
    ];
    
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        annotation[field] = req.body[field];
      }
    });

    annotation.updatedBy = req.user.id;
    annotation.version += 1;

    await annotation.save();

    // Populate and return updated annotation
    await annotation.populate('createdBy', 'username profile.firstName profile.lastName');
    await annotation.populate('updatedBy', 'username profile.firstName profile.lastName');

    res.json({
      success: true,
      message: "Annotation updated successfully",
      annotation
    });
  } catch (error) {
    console.error("Update annotation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update annotation"
    });
  }
});

// Delete annotation
router.delete("/:id", async (req, res) => {
  try {
    const annotation = await Annotation.findById(req.params.id);

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: "Annotation not found"
      });
    }

    // Check permissions - only creator can delete
    if (annotation.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Permission denied"
      });
    }

    if (annotation.locked) {
      return res.status(400).json({
        success: false,
        message: "Annotation is locked and cannot be deleted"
      });
    }

    await Annotation.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Annotation deleted successfully"
    });
  } catch (error) {
    console.error("Delete annotation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete annotation"
    });
  }
});

// Add comment to annotation
router.post("/:id/comments", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "Comment text is required"
      });
    }

    const annotation = await Annotation.findById(req.params.id);

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: "Annotation not found"
      });
    }

    // Check permissions - users with view or edit access can comment
    const hasAccess = 
      annotation.createdBy.toString() === req.user.id ||
      annotation.shared ||
      annotation.sharedWith.some(s => s.user.toString() === req.user.id);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    await annotation.addComment(req.user.id, text.trim());
    
    // Populate the annotation with updated comments
    await annotation.populate('comments.user', 'username profile.firstName profile.lastName');

    res.json({
      success: true,
      message: "Comment added successfully",
      comments: annotation.comments
    });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add comment"
    });
  }
});

// Share annotation
router.post("/:id/share", async (req, res) => {
  try {
    const { userIds, permission = 'view' } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "User IDs array is required"
      });
    }

    if (!['view', 'edit'].includes(permission)) {
      return res.status(400).json({
        success: false,
        message: "Permission must be 'view' or 'edit'"
      });
    }

    const annotation = await Annotation.findById(req.params.id);

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: "Annotation not found"
      });
    }

    // Check permissions - only creator can share
    if (annotation.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Permission denied"
      });
    }

    // Share with multiple users
    for (const userId of userIds) {
      await annotation.shareWith(userId, permission);
    }

    await annotation.populate('sharedWith.user', 'username profile.firstName profile.lastName');

    res.json({
      success: true,
      message: "Annotation shared successfully",
      sharedWith: annotation.sharedWith
    });
  } catch (error) {
    console.error("Share annotation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to share annotation"
    });
  }
});

// Approve annotation
router.post("/:id/approve", async (req, res) => {
  try {
    const annotation = await Annotation.findById(req.params.id);

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: "Annotation not found"
      });
    }

    // Check if user has approval permissions (admin or doctor role)
    if (!['admin', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions to approve annotations"
      });
    }

    await annotation.approve(req.user.id);
    
    await annotation.populate('approvedBy', 'username profile.firstName profile.lastName');

    res.json({
      success: true,
      message: "Annotation approved successfully",
      annotation: {
        _id: annotation._id,
        status: annotation.status,
        approvedBy: annotation.approvedBy,
        approvedAt: annotation.approvedAt
      }
    });
  } catch (error) {
    console.error("Approve annotation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to approve annotation"
    });
  }
});

// Reject annotation
router.post("/:id/reject", async (req, res) => {
  try {
    const { reason } = req.body;
    
    const annotation = await Annotation.findById(req.params.id);

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: "Annotation not found"
      });
    }

    // Check if user has approval permissions (admin or doctor role)
    if (!['admin', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions to reject annotations"
      });
    }

    await annotation.reject(req.user.id, reason);

    res.json({
      success: true,
      message: "Annotation rejected successfully",
      annotation: {
        _id: annotation._id,
        status: annotation.status
      }
    });
  } catch (error) {
    console.error("Reject annotation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reject annotation"
    });
  }
});

// Bulk operations
router.post("/bulk", async (req, res) => {
  try {
    const { operation, annotationIds, data } = req.body;

    if (!operation || !annotationIds || !Array.isArray(annotationIds)) {
      return res.status(400).json({
        success: false,
        message: "Operation and annotation IDs are required"
      });
    }

    let result;

    switch (operation) {
      case 'delete':
        result = await Annotation.deleteMany({
          _id: { $in: annotationIds },
          createdBy: req.user.id,
          locked: { $ne: true }
        });
        break;

      case 'hide':
        result = await Annotation.updateMany(
          {
            _id: { $in: annotationIds },
            $or: [
              { createdBy: req.user.id },
              { 'sharedWith.user': req.user.id, 'sharedWith.permission': 'edit' }
            ]
          },
          { visible: false, updatedBy: req.user.id }
        );
        break;

      case 'show':
        result = await Annotation.updateMany(
          {
            _id: { $in: annotationIds },
            $or: [
              { createdBy: req.user.id },
              { 'sharedWith.user': req.user.id, 'sharedWith.permission': 'edit' }
            ]
          },
          { visible: true, updatedBy: req.user.id }
        );
        break;

      case 'tag':
        if (!data || !data.tags) {
          return res.status(400).json({
            success: false,
            message: "Tags data is required for tag operation"
          });
        }
        result = await Annotation.updateMany(
          {
            _id: { $in: annotationIds },
            createdBy: req.user.id
          },
          { $addToSet: { tags: { $each: data.tags } }, updatedBy: req.user.id }
        );
        break;

      default:
        return res.status(400).json({
          success: false,
          message: "Invalid operation"
        });
    }

    res.json({
      success: true,
      message: `Bulk ${operation} completed successfully`,
      affectedCount: result.modifiedCount || result.deletedCount || 0
    });
  } catch (error) {
    console.error("Bulk operation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to perform bulk operation"
    });
  }
});

// Get user's annotation statistics
router.get("/user/statistics", async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      totalAnnotations,
      annotationsByType,
      annotationsByStatus,
      recentAnnotations,
      sharedAnnotations
    ] = await Promise.all([
      Annotation.countDocuments({ createdBy: userId }),
      
      Annotation.aggregate([
        { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      Annotation.aggregate([
        { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      Annotation.find({ createdBy: userId })
        .select('type createdAt studyInstanceUID sopInstanceUID')
        .sort({ createdAt: -1 })
        .limit(10),
        
      Annotation.countDocuments({ 
        'sharedWith.user': userId 
      })
    ]);

    res.json({
      success: true,
      statistics: {
        total: totalAnnotations,
        byType: annotationsByType,
        byStatus: annotationsByStatus,
        recent: recentAnnotations,
        sharedWithMe: sharedAnnotations
      }
    });
  } catch (error) {
    console.error("Get user statistics error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve statistics"
    });
  }
});

// ANNOTATION TEMPLATES

// Get annotation templates
router.get("/templates", async (req, res) => {
  try {
    const { category, type, isPublic } = req.query;
    
    let query = {
      $or: [
        { createdBy: req.user.id },
        { isPublic: true }
      ]
    };

    if (category) query.category = category;
    if (type) query.type = type;
    if (isPublic !== undefined) query.isPublic = isPublic === 'true';

    const templates = await AnnotationTemplate.find(query)
      .populate('createdBy', 'username profile.firstName profile.lastName')
      .sort({ usageCount: -1, createdAt: -1 });

    res.json({
      success: true,
      templates
    });
  } catch (error) {
    console.error("Get templates error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve templates"
    });
  }
});

// Create annotation template
router.post("/templates", async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      defaultData,
      category,
      isPublic = false
    } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        message: "Name and type are required"
      });
    }

    const template = new AnnotationTemplate({
      name,
      description,
      type,
      defaultData,
      category,
      isPublic,
      createdBy: req.user.id
    });

    await template.save();
    await template.populate('createdBy', 'username profile.firstName profile.lastName');

    res.status(201).json({
      success: true,
      message: "Template created successfully",
      template
    });
  } catch (error) {
    console.error("Create template error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create template"
    });
  }
});

// Export annotations (for backup or analysis)
router.get("/export/:studyInstanceUID", async (req, res) => {
  try {
    const { studyInstanceUID } = req.params;
    const { format = 'json' } = req.query;

    const annotations = await Annotation.find({ 
      studyInstanceUID,
      $or: [
        { createdBy: req.user.id },
        { shared: true },
        { 'sharedWith.user': req.user.id }
      ]
    })
    .populate('createdBy', 'username profile.firstName profile.lastName')
    .populate('template', 'name category')
    .lean();

    if (format === 'csv') {
      // Convert to CSV format
      const csv = annotations.map(ann => ({
        id: ann._id,
        type: ann.type,
        sopInstanceUID: ann.sopInstanceUID,
        createdBy: ann.createdBy.username,
        createdAt: ann.createdAt,
        status: ann.status,
        visible: ann.visible,
        measurementValue: ann.data?.measurement?.value || '',
        measurementUnit: ann.data?.measurement?.unit || '',
        text: ann.data?.text || '',
        tags: ann.tags ? ann.tags.join(', ') : ''
      }));

      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="annotations-${studyInstanceUID}.csv"`);
      
      // Simple CSV generation
      const headers = Object.keys(csv[0] || {}).join(',');
      const rows = csv.map(row => Object.values(row).join(','));
      res.send([headers, ...rows].join('\n'));
    } else {
      // JSON format
      res.set('Content-Type', 'application/json');
      res.set('Content-Disposition', `attachment; filename="annotations-${studyInstanceUID}.json"`);
      res.json({
        exportDate: new Date().toISOString(),
        studyInstanceUID,
        totalAnnotations: annotations.length,
        annotations
      });
    }
  } catch (error) {
    console.error("Export annotations error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to export annotations"
    });
  }
});

export default router;