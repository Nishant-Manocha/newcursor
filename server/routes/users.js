const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const FraudReport = require('../models/FraudReport');

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get user profile with statistics
// @access  Private
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    // Get user statistics
    const reportStats = await FraudReport.aggregate([
      { $match: { reportedBy: req.user._id } },
      {
        $group: {
          _id: null,
          totalReports: { $sum: 1 },
          byFraudType: {
            $push: {
              fraudType: '$fraudType',
              count: 1
            }
          },
          byStatus: {
            $push: {
              status: '$status',
              count: 1
            }
          },
          avgTrustScore: { $avg: '$verification.trustScore' }
        }
      }
    ]);

    const verificationStats = await FraudReport.aggregate([
      { $match: { 'verification.verifiedBy.user': req.user._id } },
      { $count: 'totalVerifications' }
    ]);

    const stats = {
      reports: reportStats[0] || { totalReports: 0, byFraudType: [], byStatus: [], avgTrustScore: 0 },
      verifications: verificationStats[0]?.totalVerifications || 0
    };

    res.json({
      success: true,
      data: {
        user: user.getPublicProfile(),
        preferences: user.preferences,
        location: user.location,
        deviceInfo: {
          platform: user.deviceInfo.platform,
          lastSeen: user.deviceInfo.lastSeen
        },
        stats
      }
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving profile'
    });
  }
});

// @route   PUT /api/users/preferences
// @desc    Update user notification preferences
// @access  Private
router.put('/preferences', [
  body('notifications.email').optional().isBoolean(),
  body('notifications.sms').optional().isBoolean(),
  body('notifications.push').optional().isBoolean(),
  body('alertRadius').optional().isFloat({ min: 1, max: 100 }),
  body('fraudTypes').optional().isArray(),
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

    const { notifications, alertRadius, fraudTypes } = req.body;
    
    const updateData = {};
    if (notifications) updateData['preferences.notifications'] = notifications;
    if (alertRadius) updateData['preferences.alertRadius'] = alertRadius;
    if (fraudTypes) updateData['preferences.fraudTypes'] = fraudTypes;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        preferences: user.preferences
      }
    });

  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating preferences'
    });
  }
});

// @route   PUT /api/users/device
// @desc    Update user device information
// @access  Private
router.put('/device', [
  body('fcmToken').optional().isString(),
  body('platform').optional().isIn(['web', 'android', 'ios']),
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

    const { fcmToken, platform } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (fcmToken) user.deviceInfo.fcmToken = fcmToken;
    if (platform) user.deviceInfo.platform = platform;
    user.deviceInfo.lastSeen = new Date();

    await user.save();

    res.json({
      success: true,
      message: 'Device information updated successfully'
    });

  } catch (error) {
    console.error('Update device info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating device information'
    });
  }
});

// @route   GET /api/users/reports
// @desc    Get user's fraud reports
// @access  Private
router.get('/reports', async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    const query = { reportedBy: req.user._id };
    if (status) query.status = status;

    const reports = await FraudReport.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await FraudReport.countDocuments(query);

    res.json({
      success: true,
      data: {
        reports: reports.map(report => report.getFullData(true)),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get user reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving reports'
    });
  }
});

// @route   GET /api/users/verifications
// @desc    Get user's verification history
// @access  Private
router.get('/verifications', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const reports = await FraudReport.find({
      'verification.verifiedBy.user': req.user._id
    })
    .populate('reportedBy', 'name')
    .sort({ 'verification.verifiedBy.verifiedAt': -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

    const verifications = reports.map(report => {
      const verification = report.verification.verifiedBy.find(
        v => v.user.toString() === req.user._id.toString()
      );
      
      return {
        reportId: report._id,
        reportTitle: report.title,
        fraudType: report.fraudType,
        reportedBy: report.reportedBy.name,
        vote: verification.vote,
        comment: verification.comment,
        verifiedAt: verification.verifiedAt,
        trustScore: report.verification.trustScore
      };
    });

    res.json({
      success: true,
      data: {
        verifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: verifications.length
        }
      }
    });

  } catch (error) {
    console.error('Get user verifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving verifications'
    });
  }
});

// @route   GET /api/users/leaderboard
// @desc    Get user leaderboard
// @access  Private
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 50, type = 'trustScore' } = req.query;

    let sortField = 'trustScore';
    if (type === 'reports') sortField = 'reportCount';
    else if (type === 'verifications') sortField = 'verificationCount';

    const users = await User.find({ 
      isActive: true,
      [sortField]: { $gt: 0 }
    })
    .select('name trustScore reportCount verificationCount reputation createdAt')
    .sort({ [sortField]: -1 })
    .limit(parseInt(limit));

    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      id: user._id,
      name: user.name,
      trustScore: user.trustScore,
      reportCount: user.reportCount,
      verificationCount: user.verificationCount,
      reputation: user.reputation,
      joinedAt: user.createdAt
    }));

    // Find current user's rank
    const userRank = leaderboard.findIndex(u => u.id.toString() === req.user._id.toString()) + 1;

    res.json({
      success: true,
      data: {
        leaderboard,
        userRank: userRank || null,
        totalUsers: leaderboard.length
      }
    });

  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving leaderboard'
    });
  }
});

// @route   DELETE /api/users/account
// @desc    Deactivate user account
// @access  Private
router.delete('/account', [
  body('confirmDelete').equals('DELETE').withMessage('Please confirm deletion by typing DELETE'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Account deletion confirmation required',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user._id);
    user.isActive = false;
    user.email = `deleted_${Date.now()}_${user.email}`;
    
    await user.save();

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });

  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deactivating account'
    });
  }
});

module.exports = router;