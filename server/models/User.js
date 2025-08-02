const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true,
    sparse: true,
    unique: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    },
    address: {
      type: String,
      default: ''
    },
    city: String,
    country: String
  },
  trustScore: {
    type: Number,
    default: 50,
    min: 0,
    max: 100
  },
  reportCount: {
    type: Number,
    default: 0
  },
  verificationCount: {
    type: Number,
    default: 0
  },
  reputation: {
    type: String,
    enum: ['new', 'trusted', 'verified', 'expert'],
    default: 'new'
  },
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true }
    },
    alertRadius: {
      type: Number,
      default: 10 // kilometers
    },
    fraudTypes: [{
      type: String,
      enum: ['ponzi', 'phishing', 'tax_scam', 'otp_fraud', 'fake_job', 'lottery', 'romance', 'investment', 'other']
    }]
  },
  deviceInfo: {
    fcmToken: String,
    platform: {
      type: String,
      enum: ['web', 'android', 'ios']
    },
    lastSeen: {
      type: Date,
      default: Date.now
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date
}, {
  timestamps: true
});

// Create indexes
userSchema.index({ location: '2dsphere' });
userSchema.index({ email: 1 });
userSchema.index({ trustScore: -1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Update trust score based on activity
userSchema.methods.updateTrustScore = function() {
  const baseScore = 50;
  const reportBonus = Math.min(this.reportCount * 2, 30);
  const verificationBonus = Math.min(this.verificationCount * 3, 40);
  
  this.trustScore = Math.min(baseScore + reportBonus + verificationBonus, 100);
  
  // Update reputation based on trust score
  if (this.trustScore >= 90) this.reputation = 'expert';
  else if (this.trustScore >= 75) this.reputation = 'verified';
  else if (this.trustScore >= 60) this.reputation = 'trusted';
  else this.reputation = 'new';
};

// Get user's public profile
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    name: this.name,
    trustScore: this.trustScore,
    reputation: this.reputation,
    reportCount: this.reportCount,
    verificationCount: this.verificationCount,
    joinedAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);