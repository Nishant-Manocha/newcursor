const nodemailer = require('nodemailer');
const twilio = require('twilio');
const admin = require('firebase-admin');
const User = require('../models/User');
const Alert = require('../models/Alert');
const FraudReport = require('../models/FraudReport');

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.twilioClient = null;
    this.io = null;
    this.initialized = false;
  }

  initialize(socketIo) {
    this.io = socketIo;
    
    // Initialize email transporter
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  this.emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

    // Initialize Twilio
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }

    // Initialize Firebase Admin for push notifications
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
      try {
        const serviceAccount = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL
        };

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID
        });
      } catch (error) {
        console.error('Firebase initialization failed:', error);
      }
    }

    this.initialized = true;
    console.log('Notification Service initialized');
  }

  async sendEmail(to, subject, content, html = null) {
    if (!this.emailTransporter) {
      console.log('Email not configured, skipping email notification');
      return false;
    }

    try {
      const mailOptions = {
        from: `"FraudRadar" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text: content,
        html: html || this.generateEmailHTML(subject, content)
      };

      const result = await this.emailTransporter.sendMail(mailOptions);
      console.log('Email sent successfully:', result.messageId);
      return true;
    } catch (error) {
      console.error('Email sending failed:', error);
      return false;
    }
  }

  async sendSMS(to, message) {
    if (!this.twilioClient) {
      console.log('SMS not configured, skipping SMS notification');
      return false;
    }

    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to
      });

      console.log('SMS sent successfully:', result.sid);
      return true;
    } catch (error) {
      console.error('SMS sending failed:', error);
      return false;
    }
  }

  async sendPushNotification(fcmToken, title, body, data = {}) {
    if (!admin.apps.length) {
      console.log('Firebase not configured, skipping push notification');
      return false;
    }

    try {
      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        token: fcmToken
      };

      const result = await admin.messaging().send(message);
      console.log('Push notification sent successfully:', result);
      return true;
    } catch (error) {
      console.error('Push notification failed:', error);
      return false;
    }
  }

  async createProximityAlerts(fraudReport) {
    try {
      const alertRadius = 10; // 10 km default radius
      
      // Find users within proximity
      const nearbyUsers = await User.find({
        location: {
          $near: {
            $geometry: fraudReport.location,
            $maxDistance: alertRadius * 1000 // Convert to meters
          }
        },
        isActive: true,
        'preferences.notifications.push': true
      });

      console.log(`Found ${nearbyUsers.length} nearby users for proximity alerts`);

      const alertPromises = nearbyUsers.map(async (user) => {
        // Skip the user who reported the fraud
        if (user._id.toString() === fraudReport.reportedBy.toString()) {
          return;
        }

        // Check if user is interested in this fraud type
        if (user.preferences.fraudTypes.length > 0 && 
            !user.preferences.fraudTypes.includes(fraudReport.fraudType)) {
          return;
        }

        // Calculate distance
        const distance = this.calculateDistance(
          user.location.coordinates,
          fraudReport.location.coordinates
        );

        // Skip if outside user's preferred alert radius
        if (distance > user.preferences.alertRadius) {
          return;
        }

        // Create alert
        const alert = new Alert({
          user: user._id,
          fraudReport: fraudReport._id,
          alertType: 'proximity',
          title: `🚨 Fraud Alert Nearby`,
          message: `${fraudReport.fraudType.toUpperCase()} reported ${distance.toFixed(1)}km away: ${fraudReport.title}`,
          severity: this.getSeverityFromPriority(fraudReport.priority),
          matchCriteria: {
            location: {
              distance,
              coordinates: fraudReport.location.coordinates
            }
          }
        });

        await alert.save();

        // Send notifications based on user preferences
        await this.sendAlertNotifications(user, alert);

        return alert;
      });

      await Promise.all(alertPromises);

    } catch (error) {
      console.error('Create proximity alerts error:', error);
    }
  }

  async createMatchAlerts(fraudReport) {
    try {
      const users = await User.find({ isActive: true });

      for (const user of users) {
        const alerts = [];

        // Phone number match
        if (fraudReport.evidenceData.phoneNumber && user.phone === fraudReport.evidenceData.phoneNumber) {
          alerts.push({
            alertType: 'phone_match',
            title: '⚠️ Your Phone Number Reported',
            message: `Your phone number was reported in a ${fraudReport.fraudType} scam: ${fraudReport.title}`,
            severity: 'critical',
            matchCriteria: { phoneNumber: fraudReport.evidenceData.phoneNumber }
          });
        }

        // Email match
        if (fraudReport.evidenceData.email && user.email === fraudReport.evidenceData.email) {
          alerts.push({
            alertType: 'email_match',
            title: '⚠️ Your Email Reported',
            message: `Your email was reported in a ${fraudReport.fraudType} scam: ${fraudReport.title}`,
            severity: 'critical',
            matchCriteria: { email: fraudReport.evidenceData.email }
          });
        }

        // Create and send alerts
        for (const alertData of alerts) {
          const alert = new Alert({
            user: user._id,
            fraudReport: fraudReport._id,
            ...alertData
          });

          await alert.save();
          await this.sendAlertNotifications(user, alert);
        }
      }

    } catch (error) {
      console.error('Create match alerts error:', error);
    }
  }

  async sendAlertNotifications(user, alert) {
    try {
      const notifications = [];

      // Real-time notification via Socket.IO
      if (this.io) {
        this.io.to(`user_${user._id}`).emit('new_alert', {
          id: alert._id,
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          alertType: alert.alertType,
          createdAt: alert.createdAt
        });
      }

      // Push notification
      if (alert.shouldSendViaChannel('push', user.preferences) && user.deviceInfo.fcmToken) {
        notifications.push(
          this.sendPushNotification(
            user.deviceInfo.fcmToken,
            alert.title,
            alert.message,
            {
              alertId: alert._id.toString(),
              alertType: alert.alertType,
              severity: alert.severity
            }
          ).then(sent => {
            if (sent) {
              alert.channels.push.sent = true;
              alert.channels.push.sentAt = new Date();
            }
          })
        );
      }

      // Email notification
      if (alert.shouldSendViaChannel('email', user.preferences)) {
        notifications.push(
          this.sendEmail(
            user.email,
            alert.title,
            alert.message,
            this.generateAlertEmailHTML(alert, user)
          ).then(sent => {
            if (sent) {
              alert.channels.email.sent = true;
              alert.channels.email.sentAt = new Date();
            }
          })
        );
      }

      // SMS notification (for high severity alerts)
      if (alert.shouldSendViaChannel('sms', user.preferences) && user.phone && 
          ['high', 'critical'].includes(alert.severity)) {
        const smsMessage = `FraudRadar Alert: ${alert.message}. Visit app for details.`;
        notifications.push(
          this.sendSMS(user.phone, smsMessage).then(sent => {
            if (sent) {
              alert.channels.sms.sent = true;
              alert.channels.sms.sentAt = new Date();
            }
          })
        );
      }

      await Promise.all(notifications);
      await alert.save();

    } catch (error) {
      console.error('Send alert notifications error:', error);
    }
  }

  async sendBulkAlert(message, userQuery = {}, channels = ['push']) {
    try {
      const users = await User.find({
        ...userQuery,
        isActive: true
      });

      console.log(`Sending bulk alert to ${users.length} users`);

      const notifications = users.map(async (user) => {
        const promises = [];

        if (channels.includes('push') && user.deviceInfo.fcmToken) {
          promises.push(
            this.sendPushNotification(
              user.deviceInfo.fcmToken,
              'FraudRadar Alert',
              message
            )
          );
        }

        if (channels.includes('email')) {
          promises.push(
            this.sendEmail(
              user.email,
              'FraudRadar Alert',
              message
            )
          );
        }

        if (channels.includes('sms') && user.phone) {
          promises.push(
            this.sendSMS(user.phone, `FraudRadar: ${message}`)
          );
        }

        return Promise.all(promises);
      });

      await Promise.all(notifications);
      console.log('Bulk alerts sent successfully');

    } catch (error) {
      console.error('Bulk alert error:', error);
    }
  }

  // Utility functions
  calculateDistance(coords1, coords2) {
    const [lon1, lat1] = coords1;
    const [lon2, lat2] = coords2;
    
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  getSeverityFromPriority(priority) {
    const mapping = {
      low: 'low',
      medium: 'medium',
      high: 'high',
      critical: 'critical'
    };
    return mapping[priority] || 'medium';
  }

  generateEmailHTML(subject, content) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .logo { font-size: 24px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🛡️ FraudRadar</div>
            <h2>${subject}</h2>
          </div>
          <div class="content">
            <p>${content}</p>
          </div>
          <div class="footer">
            <p>This email was sent by FraudRadar - Crowd-Powered Scam Intelligence</p>
            <p>Stay safe, stay informed!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateAlertEmailHTML(alert, user) {
    const severityColors = {
      low: '#28a745',
      medium: '#ffc107',
      high: '#fd7e14',
      critical: '#dc3545'
    };

    const severityColor = severityColors[alert.severity] || '#6c757d';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${alert.title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; }
          .header { background: ${severityColor}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .alert-box { background: white; border-left: 4px solid ${severityColor}; padding: 15px; margin: 10px 0; }
          .severity-badge { display: inline-block; background: ${severityColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; text-transform: uppercase; }
          .button { display: inline-block; background: ${severityColor}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛡️ FraudRadar Alert</h1>
            <span class="severity-badge">${alert.severity}</span>
          </div>
          <div class="content">
            <div class="alert-box">
              <h2>${alert.title}</h2>
              <p>${alert.message}</p>
              <p><strong>Alert Type:</strong> ${alert.alertType.replace('_', ' ').toUpperCase()}</p>
              <p><strong>Time:</strong> ${alert.createdAt.toLocaleString()}</p>
            </div>
            <p>Hi ${user.name},</p>
            <p>We've detected a fraud alert that may be relevant to you. Please review the details above and take appropriate action if necessary.</p>
            <a href="${process.env.CLIENT_URL}/alerts/${alert._id}" class="button">View Alert Details</a>
          </div>
          <div class="footer">
            <p>You're receiving this because you've enabled fraud alerts in your FraudRadar preferences.</p>
            <p><a href="${process.env.CLIENT_URL}/settings">Manage notification preferences</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new NotificationService();