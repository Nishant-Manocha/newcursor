const express = require('express');
const { query } = require('express-validator');
const Alert = require('../models/Alert');

const router = express.Router();

// @route   GET /api/alerts
// @desc    Get user's alerts with pagination and filters
// @access  Private
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('alertType').optional().isIn(['proximity', 'phone_match', 'email_match', 'website_match', 'pattern_match', 'high_risk']),
  query('isRead').optional().isBoolean(),
], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      severity,
      alertType,
      isRead
    } = req.query;

    const query = { user: req.user._id, isActive: true };
    
    if (severity) query.severity = severity;
    if (alertType) query.alertType = alertType;
    if (isRead !== undefined) query.isRead = isRead === 'true';

    const alerts = await Alert.find(query)
      .populate('fraudReport', 'fraudType title location priority')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Alert.countDocuments(query);
    const unreadCount = await Alert.countDocuments({ 
      user: req.user._id, 
      isActive: true, 
      isRead: false 
    });

    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        unreadCount
      }
    });

  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving alerts'
    });
  }
});

// @route   GET /api/alerts/:id
// @desc    Get single alert details
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const alert = await Alert.findOne({
      _id: req.params.id,
      user: req.user._id
    }).populate('fraudReport');

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    res.json({
      success: true,
      data: { alert }
    });

  } catch (error) {
    console.error('Get alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving alert'
    });
  }
});

// @route   PUT /api/alerts/:id/read
// @desc    Mark alert as read
// @access  Private
router.put('/:id/read', async (req, res) => {
  try {
    const alert = await Alert.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    await alert.markAsRead();

    res.json({
      success: true,
      message: 'Alert marked as read'
    });

  } catch (error) {
    console.error('Mark alert read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating alert'
    });
  }
});

// @route   PUT /api/alerts/read-all
// @desc    Mark all alerts as read
// @access  Private
router.put('/read-all', async (req, res) => {
  try {
    await Alert.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: 'All alerts marked as read'
    });

  } catch (error) {
    console.error('Mark all alerts read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating alerts'
    });
  }
});

// @route   DELETE /api/alerts/:id
// @desc    Delete/deactivate alert
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const alert = await Alert.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    alert.isActive = false;
    await alert.save();

    res.json({
      success: true,
      message: 'Alert deleted successfully'
    });

  } catch (error) {
    console.error('Delete alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting alert'
    });
  }
});

// @route   GET /api/alerts/stats
// @desc    Get user's alert statistics
// @access  Private
router.get('/stats', async (req, res) => {
  try {
    const stats = await Alert.aggregate([
      { $match: { user: req.user._id, isActive: true } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
          bySeverity: {
            $push: {
              severity: '$severity',
              count: 1
            }
          },
          byType: {
            $push: {
              alertType: '$alertType',
              count: 1
            }
          }
        }
      }
    ]);

    const result = stats[0] || {
      total: 0,
      unread: 0,
      bySeverity: [],
      byType: []
    };

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Get alert stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving alert statistics'
    });
  }
});

module.exports = router;