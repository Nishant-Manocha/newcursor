const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const FraudReport = require('../models/FraudReport');
const User = require('../models/User');
const Alert = require('../models/Alert');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const AIService = require('../services/aiService');
const NotificationService = require('../services/notificationService');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = 'uploads/fraud-evidence';
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow images and audio files
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image and audio files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files
  }
});

// @route   POST /api/fraud/report
// @desc    Submit a new fraud report
// @access  Private
router.post('/report', authMiddleware, upload.array('evidence', 5), [
  body('fraudType').isIn(['ponzi', 'phishing', 'tax_scam', 'otp_fraud', 'fake_job', 'lottery', 'romance', 'investment', 'fake_bank', 'courier_scam', 'other']),
  body('title').trim().isLength({ min: 5, max: 200 }),
  body('description').trim().isLength({ min: 10, max: 2000 }),
  body('location.coordinates').isArray().withMessage('Location coordinates required'),
  body('location.coordinates.*').isFloat().withMessage('Valid coordinates required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      fraudType,
      subCategory,
      title,
      description,
      location,
      evidenceData,
      impact,
      tags,
      anonymousReport
    } = req.body;

    // Process uploaded files
    const screenshots = [];
    let audioRecording = null;

    if (req.files) {
      for (const file of req.files) {
        const fileData = {
          url: `/uploads/fraud-evidence/${file.filename}`,
          uploadedAt: new Date()
        };

        if (file.mimetype.startsWith('image/')) {
          screenshots.push(fileData);
        } else if (file.mimetype.startsWith('audio/')) {
          audioRecording = fileData;
        }
      }
    }

    // Create fraud report
    const fraudReport = new FraudReport({
      reportedBy: req.user._id,
      fraudType,
      subCategory,
      title,
      description,
      location: {
        type: 'Point',
        coordinates: [parseFloat(location.coordinates[0]), parseFloat(location.coordinates[1])],
        address: location.address,
        city: location.city,
        state: location.state,
        country: location.country,
        zipCode: location.zipCode
      },
      evidenceData: {
        ...evidenceData,
        screenshots,
        audioRecording
      },
      impact: impact || {},
      tags: tags || [],
      anonymousReport: anonymousReport || false
    });

    // Determine priority based on fraud type and impact
    if (fraudType === 'ponzi' || fraudType === 'investment') {
      fraudReport.priority = 'high';
    } else if (impact && impact.financialLoss > 10000) {
      fraudReport.priority = 'critical';
    } else if (impact && impact.affectedUsers > 10) {
      fraudReport.priority = 'high';
    }

    await fraudReport.save();

    // Process with AI for auto-categorization
    try {
      const aiAnalysis = await AIService.analyzeFraudReport(fraudReport);
      fraudReport.aiAnalysis = aiAnalysis;
      await fraudReport.save();
    } catch (aiError) {
      console.error('AI analysis failed:', aiError);
      // Continue without AI analysis
    }

    // Update user statistics
    const user = await User.findById(req.user._id);
    user.reportCount += 1;
    user.updateTrustScore();
    await user.save();

    // Send real-time notification to nearby users
    const io = req.app.get('io');
    const roomName = `location_${Math.floor(location.coordinates[1])}_${Math.floor(location.coordinates[0])}`;
    io.to(roomName).emit('new_fraud_report', fraudReport.getMapData());

    // Create proximity alerts for nearby users
    NotificationService.createProximityAlerts(fraudReport);

    res.status(201).json({
      success: true,
      message: 'Fraud report submitted successfully',
      data: {
        report: fraudReport.getFullData()
      }
    });

  } catch (error) {
    console.error('Submit fraud report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error submitting fraud report'
    });
  }
});

// @route   GET /api/fraud/reports
// @desc    Get fraud reports with filters and pagination
// @access  Public (limited data) / Private (full data)
router.get('/reports', optionalAuth, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('fraudType').optional().isIn(['ponzi', 'phishing', 'tax_scam', 'otp_fraud', 'fake_job', 'lottery', 'romance', 'investment', 'fake_bank', 'courier_scam', 'other']),
  query('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('status').optional().isIn(['active', 'resolved', 'investigating', 'false_alarm']),
  query('lat').optional().isFloat(),
  query('lng').optional().isFloat(),
  query('radius').optional().isFloat({ min: 0.1, max: 100 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      page = 1,
      limit = 20,
      fraudType,
      priority,
      status = 'active',
      lat,
      lng,
      radius = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = { isPublic: true, status };
    
    if (fraudType) query.fraudType = fraudType;
    if (priority) query.priority = priority;
    
    // Location-based filtering
    if (lat && lng) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseFloat(radius) * 1000 // Convert km to meters
        }
      };
    }

    // Text search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const reports = await FraudReport.find(query)
      .populate('reportedBy', 'name trustScore reputation')
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await FraudReport.countDocuments(query);

    // Determine data level based on authentication
    const reportData = reports.map(report => {
      if (req.user) {
        return report.getFullData();
      } else {
        return report.getMapData();
      }
    });

    res.json({
      success: true,
      data: {
        reports: reportData,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get fraud reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving fraud reports'
    });
  }
});

// @route   GET /api/fraud/reports/:id
// @desc    Get single fraud report details
// @access  Public (limited) / Private (full)
router.get('/reports/:id', optionalAuth, async (req, res) => {
  try {
    const report = await FraudReport.findById(req.params.id)
      .populate('reportedBy', 'name trustScore reputation')
      .populate('verification.verifiedBy.user', 'name trustScore reputation');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Fraud report not found'
      });
    }

    if (!report.isPublic && (!req.user || report.reportedBy.toString() !== req.user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this report'
      });
    }

    const includeEvidence = req.user && (
      report.reportedBy.toString() === req.user._id.toString() ||
      req.user.reputation === 'expert'
    );

    res.json({
      success: true,
      data: {
        report: report.getFullData(includeEvidence)
      }
    });

  } catch (error) {
    console.error('Get fraud report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving fraud report'
    });
  }
});

// @route   POST /api/fraud/reports/:id/verify
// @desc    Verify/vote on a fraud report
// @access  Private
router.post('/reports/:id/verify', authMiddleware, [
  body('vote').isIn(['confirm', 'deny', 'uncertain']),
  body('comment').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { vote, comment } = req.body;
    const reportId = req.params.id;
    const userId = req.user._id;

    const report = await FraudReport.findById(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Fraud report not found'
      });
    }

    // Check if user already verified this report
    const existingVerification = report.verification.verifiedBy.find(
      v => v.user.toString() === userId.toString()
    );

    if (existingVerification) {
      // Update existing verification
      existingVerification.vote = vote;
      existingVerification.comment = comment;
      existingVerification.verifiedAt = new Date();
    } else {
      // Add new verification
      report.verification.verifiedBy.push({
        user: userId,
        vote,
        comment,
        verifiedAt: new Date()
      });
      report.verification.verificationCount += 1;
    }

    // Recalculate trust score
    await report.populate('verification.verifiedBy.user', 'trustScore');
    report.calculateTrustScore();
    await report.save();

    // Update user verification count
    const user = await User.findById(userId);
    if (!existingVerification) {
      user.verificationCount += 1;
      user.updateTrustScore();
      await user.save();
    }

    // Send real-time update
    const io = req.app.get('io');
    io.emit('report_verified', {
      reportId: report._id,
      trustScore: report.verification.trustScore,
      verificationCount: report.verification.verificationCount
    });

    res.json({
      success: true,
      message: 'Verification submitted successfully',
      data: {
        trustScore: report.verification.trustScore,
        verificationCount: report.verification.verificationCount
      }
    });

  } catch (error) {
    console.error('Verify report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error submitting verification'
    });
  }
});

// @route   GET /api/fraud/map-data
// @desc    Get fraud reports for map visualization
// @access  Public
router.get('/map-data', [
  query('bounds').exists().withMessage('Map bounds required'),
  query('fraudTypes').optional(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { bounds, fraudTypes } = req.query;
    
    // Parse bounds: "sw_lat,sw_lng,ne_lat,ne_lng"
    const [swLat, swLng, neLat, neLng] = bounds.split(',').map(parseFloat);

    const query = {
      isPublic: true,
      status: 'active',
      location: {
        $geoWithin: {
          $box: [[swLng, swLat], [neLng, neLat]]
        }
      }
    };

    if (fraudTypes) {
      const types = fraudTypes.split(',');
      query.fraudType = { $in: types };
    }

    const reports = await FraudReport.find(query)
      .select('fraudType subCategory title location verification.trustScore verification.verificationCount priority createdAt aiAnalysis.riskScore status')
      .limit(1000); // Limit for performance

    const mapData = reports.map(report => report.getMapData());

    res.json({
      success: true,
      data: {
        reports: mapData,
        count: mapData.length
      }
    });

  } catch (error) {
    console.error('Get map data error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving map data'
    });
  }
});

// @route   POST /api/fraud/check
// @desc    Check if phone/email/website is reported as fraud
// @access  Public
router.post('/check', [
  body('type').isIn(['phone', 'email', 'website']),
  body('value').exists().withMessage('Value to check is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { type, value } = req.body;
    
    const searchField = type === 'phone' ? 'evidenceData.phoneNumber' :
                       type === 'email' ? 'evidenceData.email' :
                       'evidenceData.website';

    const reports = await FraudReport.find({
      [searchField]: value,
      status: 'active',
      isPublic: true
    })
    .select('fraudType title verification.trustScore verification.verificationCount priority createdAt')
    .sort({ 'verification.trustScore': -1 })
    .limit(10);

    const isReported = reports.length > 0;
    const highestTrustScore = isReported ? Math.max(...reports.map(r => r.verification.trustScore)) : 0;
    const totalReports = reports.length;

    let riskLevel = 'low';
    if (highestTrustScore >= 80) riskLevel = 'critical';
    else if (highestTrustScore >= 60) riskLevel = 'high';
    else if (highestTrustScore >= 40) riskLevel = 'medium';

    res.json({
      success: true,
      data: {
        isReported,
        riskLevel,
        trustScore: highestTrustScore,
        totalReports,
        reports: reports.map(r => ({
          id: r._id,
          fraudType: r.fraudType,
          title: r.title,
          trustScore: r.verification.trustScore,
          verificationCount: r.verification.verificationCount,
          priority: r.priority,
          reportedAt: r.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('Check fraud error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error checking fraud data'
    });
  }
});

module.exports = router;