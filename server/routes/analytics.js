const express = require('express');
const { query } = require('express-validator');
const FraudReport = require('../models/FraudReport');
const User = require('../models/User');
const AIService = require('../services/aiService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/analytics/fraud-trends
// @desc    Get fraud trends and statistics
// @access  Public
router.get('/fraud-trends', optionalAuth, [
  query('period').optional().isIn(['7d', '30d', '90d', '1y']),
  query('location').optional(),
], async (req, res) => {
  try {
    const { period = '30d', location } = req.query;
    
    // Calculate date range
    const now = new Date();
    const periodMap = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    };
    const startDate = new Date(now.getTime() - (periodMap[period] * 24 * 60 * 60 * 1000));

    // Build query
    const matchQuery = {
      createdAt: { $gte: startDate },
      isPublic: true,
      status: 'active'
    };

    // Add location filter if provided
    if (location) {
      const [lat, lng, radius = 50] = location.split(',').map(parseFloat);
      matchQuery.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: radius * 1000 // Convert km to meters
        }
      };
    }

    // Aggregate fraud statistics
    const trends = await FraudReport.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalReports: { $sum: 1 },
          byFraudType: {
            $push: {
              k: '$fraudType',
              v: 1
            }
          },
          byPriority: {
            $push: {
              k: '$priority',
              v: 1
            }
          },
          avgTrustScore: { $avg: '$verification.trustScore' },
          avgRiskScore: { $avg: '$aiAnalysis.riskScore' },
          totalFinancialLoss: { $sum: '$impact.financialLoss' },
          totalAffectedUsers: { $sum: '$impact.affectedUsers' }
        }
      }
    ]);

    // Time series data
    const timeSeriesData = await FraudReport.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === '7d' ? '%Y-%m-%d' : period === '30d' ? '%Y-%m-%d' : '%Y-%m',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 },
          avgRiskScore: { $avg: '$aiAnalysis.riskScore' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Hot spots (top locations with most reports)
    const hotSpots = await FraudReport.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            city: '$location.city',
            state: '$location.state',
            country: '$location.country'
          },
          count: { $sum: 1 },
          location: { $first: '$location' },
          avgRiskScore: { $avg: '$aiAnalysis.riskScore' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get AI insights
    const recentReports = await FraudReport.find(matchQuery).limit(1000);
    const aiInsights = AIService.getFraudTrends(recentReports);

    const result = {
      period,
      dateRange: { start: startDate, end: now },
      summary: trends[0] || {
        totalReports: 0,
        byFraudType: [],
        byPriority: [],
        avgTrustScore: 0,
        avgRiskScore: 0,
        totalFinancialLoss: 0,
        totalAffectedUsers: 0
      },
      timeSeries: timeSeriesData,
      hotSpots,
      aiInsights,
      location: location ? { lat: parseFloat(location.split(',')[0]), lng: parseFloat(location.split(',')[1]) } : null
    };

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Get fraud trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving fraud trends'
    });
  }
});

// @route   GET /api/analytics/risk-heatmap
// @desc    Get risk heatmap data for map visualization
// @access  Public
router.get('/risk-heatmap', [
  query('bounds').exists().withMessage('Map bounds required'),
  query('zoom').optional().isInt({ min: 1, max: 20 }),
], async (req, res) => {
  try {
    const { bounds, zoom = 10 } = req.query;
    
    // Parse bounds: "sw_lat,sw_lng,ne_lat,ne_lng"
    const [swLat, swLng, neLat, neLng] = bounds.split(',').map(parseFloat);

    // Determine grid size based on zoom level
    const gridSize = Math.max(0.01, 0.1 / Math.pow(2, zoom - 10));

    const heatmapData = await FraudReport.aggregate([
      {
        $match: {
          location: {
            $geoWithin: {
              $box: [[swLng, swLat], [neLng, neLat]]
            }
          },
          isPublic: true,
          status: 'active',
          createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
        }
      },
      {
        $group: {
          _id: {
            lat: {
              $multiply: [
                { $round: { $divide: [{ $arrayElemAt: ['$location.coordinates', 1] }, gridSize] } },
                gridSize
              ]
            },
            lng: {
              $multiply: [
                { $round: { $divide: [{ $arrayElemAt: ['$location.coordinates', 0] }, gridSize] } },
                gridSize
              ]
            }
          },
          count: { $sum: 1 },
          avgRiskScore: { $avg: '$aiAnalysis.riskScore' },
          maxRiskScore: { $max: '$aiAnalysis.riskScore' },
          fraudTypes: { $addToSet: '$fraudType' },
          totalFinancialLoss: { $sum: '$impact.financialLoss' }
        }
      },
      {
        $project: {
          lat: '$_id.lat',
          lng: '$_id.lng',
          count: 1,
          avgRiskScore: 1,
          maxRiskScore: 1,
          fraudTypes: 1,
          totalFinancialLoss: 1,
          intensity: {
            $min: [
              { $divide: [{ $add: ['$count', '$avgRiskScore'] }, 20] },
              1
            ]
          }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 1000 }
    ]);

    res.json({
      success: true,
      data: {
        heatmap: heatmapData,
        gridSize,
        zoom: parseInt(zoom),
        bounds: { swLat, swLng, neLat, neLng }
      }
    });

  } catch (error) {
    console.error('Get risk heatmap error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving risk heatmap'
    });
  }
});

// @route   GET /api/analytics/user-stats
// @desc    Get platform user statistics
// @access  Public
router.get('/user-stats', async (req, res) => {
  try {
    const stats = await User.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } },
          byReputation: {
            $push: {
              k: '$reputation',
              v: 1
            }
          },
          avgTrustScore: { $avg: '$trustScore' },
          totalReports: { $sum: '$reportCount' },
          totalVerifications: { $sum: '$verificationCount' }
        }
      }
    ]);

    // Recent activity
    const recentActivity = await User.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          newUsers: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);

    const result = {
      summary: stats[0] || {
        totalUsers: 0,
        verifiedUsers: 0,
        byReputation: [],
        avgTrustScore: 0,
        totalReports: 0,
        totalVerifications: 0
      },
      recentActivity: recentActivity.reverse()
    };

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving user statistics'
    });
  }
});

// @route   GET /api/analytics/search-trends
// @desc    Get search and lookup trends
// @access  Public
router.get('/search-trends', async (req, res) => {
  try {
    // Most searched fraud types
    const fraudTypeSearches = await FraudReport.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          isPublic: true
        }
      },
      {
        $group: {
          _id: '$fraudType',
          count: { $sum: 1 },
          avgTrustScore: { $avg: '$verification.trustScore' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Most reported phone/email patterns
    const commonPatterns = await FraudReport.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          isPublic: true,
          $or: [
            { 'evidenceData.phoneNumber': { $exists: true, $ne: '' } },
            { 'evidenceData.email': { $exists: true, $ne: '' } }
          ]
        }
      },
      {
        $group: {
          _id: {
            phonePrefix: { $substr: ['$evidenceData.phoneNumber', 0, 5] },
            emailDomain: {
              $arrayElemAt: [
                { $split: ['$evidenceData.email', '@'] },
                1
              ]
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    // AI keyword trends
    const keywordTrends = await FraudReport.aggregate([
      {
        $match: {
          'aiAnalysis.keywords': { $exists: true, $ne: [] },
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      { $unwind: '$aiAnalysis.keywords' },
      {
        $group: {
          _id: '$aiAnalysis.keywords',
          count: { $sum: 1 },
          avgRiskScore: { $avg: '$aiAnalysis.riskScore' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);

    res.json({
      success: true,
      data: {
        fraudTypeSearches,
        commonPatterns: commonPatterns.filter(p => p._id.phonePrefix || p._id.emailDomain),
        keywordTrends
      }
    });

  } catch (error) {
    console.error('Get search trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving search trends'
    });
  }
});

// @route   GET /api/analytics/export
// @desc    Export analytics data (for law enforcement/research)
// @access  Private (requires special permissions)
router.get('/export', optionalAuth, [
  query('format').optional().isIn(['json', 'csv']),
  query('period').optional().isIn(['7d', '30d', '90d', '1y']),
  query('type').optional().isIn(['reports', 'trends', 'users']),
], async (req, res) => {
  try {
    // Note: In production, this would require special permissions/API keys
    // For hackathon demo, we'll allow limited access
    
    const { format = 'json', period = '30d', type = 'trends' } = req.query;
    
    if (type === 'trends') {
      // Export aggregated trends (no personal data)
      const data = await FraudReport.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            isPublic: true
          }
        },
        {
          $group: {
            _id: {
              fraudType: '$fraudType',
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            },
            count: { $sum: 1 },
            avgRiskScore: { $avg: '$aiAnalysis.riskScore' }
          }
        },
        { $sort: { '_id.date': 1 } }
      ]);

      if (format === 'csv') {
        const csv = 'Date,FraudType,Count,AvgRiskScore\n' + 
          data.map(d => `${d._id.date},${d._id.fraudType},${d.count},${d.avgRiskScore}`).join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="fraud_trends.csv"');
        res.send(csv);
      } else {
        res.json({
          success: true,
          data,
          exportedAt: new Date(),
          format,
          type
        });
      }
    } else {
      res.status(403).json({
        success: false,
        message: 'Export type not available for public access'
      });
    }

  } catch (error) {
    console.error('Export analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error exporting analytics'
    });
  }
});

module.exports = router;