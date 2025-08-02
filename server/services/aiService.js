const natural = require('natural');
const compromise = require('compromise');
const axios = require('axios');

class AIService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.analyzer = new natural.SentimentAnalyzer('English', this.stemmer, 'afinn');
    
    // Fraud type keywords database
    this.fraudKeywords = {
      ponzi: [
        'investment', 'returns', 'guaranteed', 'profit', 'scheme', 'referral',
        'pyramid', 'mlm', 'recruit', 'downline', 'passive income', 'compound',
        'roi', 'dividend', 'portfolio', 'fund', 'trading', 'forex'
      ],
      phishing: [
        'verify', 'account', 'suspended', 'click', 'link', 'urgent', 'expire',
        'confirm', 'identity', 'security', 'update', 'login', 'password',
        'credential', 'authentication', 'validate', 'secure'
      ],
      tax_scam: [
        'tax', 'refund', 'irs', 'government', 'audit', 'penalty', 'fine',
        'return', 'filing', 'assessment', 'dues', 'department', 'revenue',
        'compliance', 'notice', 'enforcement'
      ],
      otp_fraud: [
        'otp', 'code', 'verification', 'pin', 'sms', 'authenticate', 'confirm',
        'security code', 'access code', 'temporary', 'expire', 'valid',
        'authorization', 'token'
      ],
      fake_job: [
        'job', 'hiring', 'work from home', 'part time', 'salary', 'income',
        'employment', 'position', 'vacancy', 'opportunity', 'earn', 'money',
        'payment', 'advance', 'registration fee', 'training'
      ],
      lottery: [
        'lottery', 'winner', 'prize', 'jackpot', 'congratulations', 'selected',
        'award', 'million', 'draw', 'ticket', 'claim', 'lucky', 'winning',
        'sweepstake', 'raffle'
      ],
      romance: [
        'love', 'relationship', 'lonely', 'widow', 'military', 'overseas',
        'emergency', 'help', 'money', 'transfer', 'western union', 'gift',
        'travel', 'visa', 'hospital', 'accident'
      ],
      investment: [
        'crypto', 'bitcoin', 'trading', 'stocks', 'shares', 'market', 'profit',
        'investment', 'broker', 'platform', 'deposit', 'withdraw', 'trading bot',
        'signal', 'expert', 'guaranteed returns'
      ],
      fake_bank: [
        'bank', 'account', 'balance', 'transaction', 'transfer', 'credit',
        'debit', 'loan', 'approved', 'officer', 'manager', 'branch',
        'atm', 'card', 'blocked', 'frozen'
      ],
      courier_scam: [
        'courier', 'package', 'delivery', 'parcel', 'shipping', 'customs',
        'clearance', 'fee', 'detention', 'held', 'release', 'agent',
        'office', 'collect', 'pay'
      ]
    };

    // Risk indicators
    this.riskIndicators = [
      'urgent', 'immediate', 'limited time', 'act now', 'hurry', 'expire',
      'guaranteed', '100%', 'risk free', 'no risk', 'free money',
      'click here', 'call now', 'contact immediately', 'dont delay',
      'exclusive', 'selected', 'chosen', 'winner', 'congratulations',
      'verify account', 'suspend', 'block', 'freeze', 'penalty',
      'legal action', 'arrest', 'warrant', 'court', 'fine'
    ];

    this.phonePatterns = [
      /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g, // US
      /(\+?91[-.\s]?)?[6-9]\d{9}/g, // India
      /(\+?44[-.\s]?)?[0-9]{10,11}/g, // UK
      /(\+?86[-.\s]?)?1[3-9]\d{9}/g // China
    ];

    this.emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    this.urlPattern = /(https?:\/\/[^\s]+)/g;
  }

  initialize() {
    console.log('AI Service initialized');
  }

  async analyzeFraudReport(report) {
    try {
      const analysis = {
        confidence: 0,
        detectedFraudType: null,
        riskScore: 0,
        keywords: [],
        sentiment: 'neutral',
        urlAnalysis: {},
        processedAt: new Date()
      };

      const textContent = `${report.title} ${report.description} ${report.evidenceData.messageContent || ''}`;
      
      // Text analysis
      const textAnalysis = this.analyzeText(textContent);
      analysis.detectedFraudType = textAnalysis.fraudType;
      analysis.confidence = textAnalysis.confidence;
      analysis.keywords = textAnalysis.keywords;
      analysis.sentiment = textAnalysis.sentiment;
      analysis.riskScore = textAnalysis.riskScore;

      // URL analysis if website evidence exists
      if (report.evidenceData.website) {
        const urlAnalysis = await this.analyzeURL(report.evidenceData.website);
        analysis.urlAnalysis = urlAnalysis;
        
        // Adjust risk score based on URL analysis
        if (urlAnalysis.isPhishing) {
          analysis.riskScore = Math.min(analysis.riskScore + 30, 100);
        }
      }

      // Phone number analysis
      if (report.evidenceData.phoneNumber) {
        const phoneAnalysis = this.analyzePhoneNumber(report.evidenceData.phoneNumber);
        if (phoneAnalysis.suspicious) {
          analysis.riskScore = Math.min(analysis.riskScore + 15, 100);
        }
      }

      // Priority-based risk adjustment
      if (report.priority === 'critical') {
        analysis.riskScore = Math.min(analysis.riskScore + 20, 100);
      } else if (report.priority === 'high') {
        analysis.riskScore = Math.min(analysis.riskScore + 10, 100);
      }

      return analysis;

    } catch (error) {
      console.error('AI analysis error:', error);
      return {
        confidence: 0,
        detectedFraudType: report.fraudType,
        riskScore: 30, // Default risk score
        keywords: [],
        sentiment: 'neutral',
        urlAnalysis: {},
        processedAt: new Date()
      };
    }
  }

  analyzeText(text) {
    const lowerText = text.toLowerCase();
    const tokens = this.tokenizer.tokenize(lowerText);
    const stemmed = tokens.map(token => this.stemmer.stem(token));
    
    // Calculate sentiment
    const sentiment = this.calculateSentiment(tokens);
    
    // Detect fraud type based on keywords
    const fraudTypeScores = {};
    let detectedKeywords = [];

    // Score each fraud type
    Object.keys(this.fraudKeywords).forEach(fraudType => {
      let score = 0;
      const typeKeywords = [];
      
      this.fraudKeywords[fraudType].forEach(keyword => {
        const keywordLower = keyword.toLowerCase();
        if (lowerText.includes(keywordLower)) {
          score += 1;
          typeKeywords.push(keyword);
        }
      });
      
      fraudTypeScores[fraudType] = score;
      if (score > 0) {
        detectedKeywords = detectedKeywords.concat(typeKeywords);
      }
    });

    // Find the fraud type with highest score
    const detectedFraudType = Object.keys(fraudTypeScores).reduce((a, b) => 
      fraudTypeScores[a] > fraudTypeScores[b] ? a : b
    );

    const maxScore = fraudTypeScores[detectedFraudType];
    const confidence = Math.min((maxScore / 3) * 100, 100); // Normalize to 0-100

    // Calculate risk score based on risk indicators
    let riskScore = 0;
    this.riskIndicators.forEach(indicator => {
      if (lowerText.includes(indicator.toLowerCase())) {
        riskScore += 10;
      }
    });

    // Adjust risk based on sentiment (negative sentiment often indicates scams)
    if (sentiment === 'negative') {
      riskScore += 15;
    } else if (sentiment === 'positive') {
      riskScore += 5; // Sometimes scams use overly positive language
    }

    // Adjust based on urgency words
    const urgencyWords = ['urgent', 'immediate', 'asap', 'hurry', 'quick', 'fast'];
    urgencyWords.forEach(word => {
      if (lowerText.includes(word)) {
        riskScore += 8;
      }
    });

    riskScore = Math.min(riskScore, 100);

    return {
      fraudType: maxScore > 0 ? detectedFraudType : null,
      confidence,
      keywords: [...new Set(detectedKeywords)], // Remove duplicates
      sentiment,
      riskScore
    };
  }

  calculateSentiment(tokens) {
    try {
      const sentimentScore = this.analyzer.getSentiment(tokens);
      
      if (sentimentScore > 0.1) return 'positive';
      if (sentimentScore < -0.1) return 'negative';
      return 'neutral';
    } catch (error) {
      return 'neutral';
    }
  }

  async analyzeURL(url) {
    try {
      const analysis = {
        isPhishing: false,
        virusTotalScore: 0,
        safeBrowsingResult: 'safe'
      };

      // Basic URL pattern analysis
      const suspiciousPatterns = [
        /bit\.ly|tinyurl|goo\.gl|t\.co/, // URL shorteners
        /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/, // IP addresses
        /-|_|\.tk|\.ml|\.ga|\.cf/, // Suspicious TLDs or patterns
        /[0-9]{5,}/, // Long numbers in domain
        /paypal|amazon|google|microsoft|apple/i // Brand impersonation (basic check)
      ];

      let suspiciousScore = 0;
      suspiciousPatterns.forEach(pattern => {
        if (pattern.test(url)) {
          suspiciousScore += 20;
        }
      });

      analysis.isPhishing = suspiciousScore >= 40;

      // VirusTotal check (if API key available)
      if (process.env.VIRUSTOTAL_API_KEY) {
        try {
          const vtResponse = await this.checkVirusTotal(url);
          analysis.virusTotalScore = vtResponse.positives || 0;
          if (vtResponse.positives > 3) {
            analysis.isPhishing = true;
          }
        } catch (vtError) {
          console.error('VirusTotal check failed:', vtError);
        }
      }

      // Google Safe Browsing check (if API key available)
      if (process.env.GOOGLE_SAFE_BROWSING_API_KEY) {
        try {
          const sbResponse = await this.checkSafeBrowsing(url);
          analysis.safeBrowsingResult = sbResponse.threat || 'safe';
          if (sbResponse.threat !== 'safe') {
            analysis.isPhishing = true;
          }
        } catch (sbError) {
          console.error('Safe Browsing check failed:', sbError);
        }
      }

      return analysis;

    } catch (error) {
      console.error('URL analysis error:', error);
      return {
        isPhishing: false,
        virusTotalScore: 0,
        safeBrowsingResult: 'unknown'
      };
    }
  }

  async checkVirusTotal(url) {
    const response = await axios.post('https://www.virustotal.com/vtapi/v2/url/report', {
      apikey: process.env.VIRUSTOTAL_API_KEY,
      resource: url
    });

    return response.data;
  }

  async checkSafeBrowsing(url) {
    const response = await axios.post(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${process.env.GOOGLE_SAFE_BROWSING_API_KEY}`,
      {
        client: {
          clientId: 'fraudradar',
          clientVersion: '1.0.0'
        },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }]
        }
      }
    );

    const matches = response.data.matches || [];
    if (matches.length > 0) {
      return { threat: matches[0].threatType.toLowerCase() };
    }

    return { threat: 'safe' };
  }

  analyzePhoneNumber(phoneNumber) {
    // Remove formatting
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
    
    const analysis = {
      suspicious: false,
      country: null,
      type: 'unknown',
      confidence: 0
    };

    // Check for common scam number patterns
    const scamPatterns = [
      /^\+1900/, // Premium rate numbers
      /^\+1976/, // Premium rate numbers
      /^\+234/, // Nigeria (common in romance scams)
      /^\+233/, // Ghana
      /^\+225/, // Ivory Coast
      /^0000/, // Obviously fake
      /^1111/, // Obviously fake
      /^9999/ // Obviously fake
    ];

    scamPatterns.forEach(pattern => {
      if (pattern.test(cleanNumber)) {
        analysis.suspicious = true;
        analysis.confidence += 30;
      }
    });

    // Check if number is too short or too long
    if (cleanNumber.length < 7 || cleanNumber.length > 15) {
      analysis.suspicious = true;
      analysis.confidence += 20;
    }

    return analysis;
  }

  // Batch analysis for multiple reports
  async batchAnalyze(reports) {
    const results = [];
    
    for (const report of reports) {
      try {
        const analysis = await this.analyzeFraudReport(report);
        results.push({
          reportId: report._id,
          analysis
        });
      } catch (error) {
        console.error(`Batch analysis failed for report ${report._id}:`, error);
        results.push({
          reportId: report._id,
          analysis: null,
          error: error.message
        });
      }
    }

    return results;
  }

  // Get fraud trend analysis
  getFraudTrends(reports) {
    const trends = {
      totalReports: reports.length,
      fraudTypes: {},
      riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
      commonKeywords: {},
      timeAnalysis: {}
    };

    reports.forEach(report => {
      // Fraud type distribution
      trends.fraudTypes[report.fraudType] = (trends.fraudTypes[report.fraudType] || 0) + 1;

      // Risk distribution
      if (report.aiAnalysis && report.aiAnalysis.riskScore) {
        const riskScore = report.aiAnalysis.riskScore;
        if (riskScore >= 80) trends.riskDistribution.critical++;
        else if (riskScore >= 60) trends.riskDistribution.high++;
        else if (riskScore >= 30) trends.riskDistribution.medium++;
        else trends.riskDistribution.low++;
      }

      // Keyword frequency
      if (report.aiAnalysis && report.aiAnalysis.keywords) {
        report.aiAnalysis.keywords.forEach(keyword => {
          trends.commonKeywords[keyword] = (trends.commonKeywords[keyword] || 0) + 1;
        });
      }

      // Time analysis (by hour and day)
      const createdAt = new Date(report.createdAt);
      const hour = createdAt.getHours();
      const day = createdAt.getDay();
      
      trends.timeAnalysis[`hour_${hour}`] = (trends.timeAnalysis[`hour_${hour}`] || 0) + 1;
      trends.timeAnalysis[`day_${day}`] = (trends.timeAnalysis[`day_${day}`] || 0) + 1;
    });

    return trends;
  }
}

module.exports = new AIService();