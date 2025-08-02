const mongoose = require('mongoose');

const fraudReportSchema = new mongoose.Schema({
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fraudType: {
    type: String,
    enum: ['ponzi', 'phishing', 'tax_scam', 'otp_fraud', 'fake_job', 'lottery', 'romance', 'investment', 'fake_bank', 'courier_scam', 'other'],
    required: true
  },
  subCategory: {
    type: String,
    enum: ['sms', 'call', 'email', 'website', 'app', 'social_media', 'whatsapp', 'telegram']
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  evidenceData: {
    phoneNumber: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    website: {
      type: String,
      trim: true
    },
    accountDetails: {
      bankName: String,
      accountNumber: String,
      ifscCode: String,
      upiId: String
    },
    messageContent: String,
    screenshots: [{
      url: String,
      uploadedAt: { type: Date, default: Date.now }
    }],
    audioRecording: {
      url: String,
      duration: Number, // in seconds
      uploadedAt: { type: Date, default: Date.now }
    }
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    address: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  aiAnalysis: {
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    detectedFraudType: {
      type: String,
      enum: ['ponzi', 'phishing', 'tax_scam', 'otp_fraud', 'fake_job', 'lottery', 'romance', 'investment', 'fake_bank', 'courier_scam', 'other']
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    keywords: [String],
    sentiment: {
      type: String,
      enum: ['positive', 'negative', 'neutral']
    },
    urlAnalysis: {
      isPhishing: Boolean,
      virusTotalScore: Number,
      safeBrowsingResult: String
    },
    processedAt: {
      type: Date,
      default: Date.now
    }
  },
  verification: {
    trustScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    verificationCount: {
      type: Number,
      default: 0
    },
    verifiedBy: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      vote: {
        type: String,
        enum: ['confirm', 'deny', 'uncertain']
      },
      comment: String,
      verifiedAt: {
        type: Date,
        default: Date.now
      }
    }],
    status: {
      type: String,
      enum: ['pending', 'verified', 'disputed', 'false_positive'],
      default: 'pending'
    }
  },
  impact: {
    financialLoss: {
      type: Number,
      default: 0
    },
    affectedUsers: {
      type: Number,
      default: 1
    },
    reportedElsewhere: {
      type: Boolean,
      default: false
    }
  },
  tags: [String],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['active', 'resolved', 'investigating', 'false_alarm'],
    default: 'active'
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  anonymousReport: {
    type: Boolean,
    default: false
  },
  resolvedAt: Date,
  investigationNotes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Create indexes for efficient querying
fraudReportSchema.index({ location: '2dsphere' });
fraudReportSchema.index({ fraudType: 1 });
fraudReportSchema.index({ 'verification.trustScore': -1 });
fraudReportSchema.index({ createdAt: -1 });
fraudReportSchema.index({ 'evidenceData.phoneNumber': 1 });
fraudReportSchema.index({ 'evidenceData.email': 1 });
fraudReportSchema.index({ 'evidenceData.website': 1 });
fraudReportSchema.index({ status: 1 });
fraudReportSchema.index({ priority: 1 });

// Calculate trust score based on verifications
fraudReportSchema.methods.calculateTrustScore = function() {
  if (this.verification.verificationCount === 0) {
    this.verification.trustScore = 30; // Base score for unverified reports
    return;
  }

  const confirmVotes = this.verification.verifiedBy.filter(v => v.vote === 'confirm').length;
  const denyVotes = this.verification.verifiedBy.filter(v => v.vote === 'deny').length;
  const totalVotes = this.verification.verificationCount;

  // Calculate weighted score based on user trust scores
  let weightedConfirm = 0;
  let weightedDeny = 0;
  let totalWeight = 0;

  this.verification.verifiedBy.forEach(verification => {
    if (verification.user && verification.user.trustScore) {
      const weight = verification.user.trustScore / 100;
      totalWeight += weight;
      
      if (verification.vote === 'confirm') {
        weightedConfirm += weight;
      } else if (verification.vote === 'deny') {
        weightedDeny += weight;
      }
    }
  });

  if (totalWeight > 0) {
    this.verification.trustScore = Math.round((weightedConfirm / totalWeight) * 100);
  } else {
    // Fallback to simple percentage
    this.verification.trustScore = Math.round((confirmVotes / totalVotes) * 100);
  }

  // Update verification status based on trust score
  if (this.verification.trustScore >= 80) {
    this.verification.status = 'verified';
  } else if (this.verification.trustScore <= 20) {
    this.verification.status = 'disputed';
  } else {
    this.verification.status = 'pending';
  }
};

// Get public data for map display
fraudReportSchema.methods.getMapData = function() {
  return {
    id: this._id,
    fraudType: this.fraudType,
    subCategory: this.subCategory,
    title: this.title,
    location: this.location,
    trustScore: this.verification.trustScore,
    verificationCount: this.verification.verificationCount,
    priority: this.priority,
    createdAt: this.createdAt,
    riskScore: this.aiAnalysis.riskScore,
    status: this.status
  };
};

// Get full report data (for authenticated users)
fraudReportSchema.methods.getFullData = function(includeEvidence = false) {
  const data = {
    id: this._id,
    fraudType: this.fraudType,
    subCategory: this.subCategory,
    title: this.title,
    description: this.description,
    location: this.location,
    verification: this.verification,
    aiAnalysis: this.aiAnalysis,
    impact: this.impact,
    tags: this.tags,
    priority: this.priority,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };

  if (includeEvidence) {
    data.evidenceData = this.evidenceData;
  }

  return data;
};

module.exports = mongoose.model('FraudReport', fraudReportSchema);