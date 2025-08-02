const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fraudReport: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FraudReport',
    required: true
  },
  alertType: {
    type: String,
    enum: ['proximity', 'phone_match', 'email_match', 'website_match', 'pattern_match', 'high_risk'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  channels: {
    email: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      opened: { type: Boolean, default: false },
      openedAt: Date
    },
    sms: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      delivered: { type: Boolean, default: false },
      deliveredAt: Date
    },
    push: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      clicked: { type: Boolean, default: false },
      clickedAt: Date
    }
  },
  matchCriteria: {
    location: {
      distance: Number, // in kilometers
      coordinates: [Number]
    },
    phoneNumber: String,
    email: String,
    website: String,
    keywords: [String]
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  }
}, {
  timestamps: true
});

// Create indexes
alertSchema.index({ user: 1, createdAt: -1 });
alertSchema.index({ user: 1, isRead: 1 });
alertSchema.index({ alertType: 1 });
alertSchema.index({ severity: 1 });
alertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Mark alert as read
alertSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Check if alert should be sent via specific channel
alertSchema.methods.shouldSendViaChannel = function(channel, userPreferences) {
  if (!userPreferences.notifications[channel]) return false;
  if (this.channels[channel].sent) return false;
  
  // Check severity requirements
  if (channel === 'sms' && this.severity === 'low') return false;
  
  return true;
};

module.exports = mongoose.model('Alert', alertSchema);