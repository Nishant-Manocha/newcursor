# 🛡️ FraudRadar - Crowd-Powered Scam Intelligence

**Real-time fraud detection and reporting platform that works like "Google Maps for Scams"**

FraudRadar is a comprehensive, community-driven fraud detection platform that empowers users to report scams, get real-time fraud alerts, and access AI-powered scam intelligence. Built for hackathons and designed to scale as a startup, it provides a complete solution for fraud prevention and community protection.

![FraudRadar Banner](https://via.placeholder.com/1200x400/667eea/ffffff?text=FraudRadar+-+Crowd-Powered+Scam+Intelligence)

## 🚀 **Live Demo**

- **Frontend**: [https://fraudradar.app](https://fraudradar.app) (Demo)
- **API Documentation**: [https://api.fraudradar.app/docs](https://api.fraudradar.app/docs) (Demo)
- **Test Credentials**: 
  - Email: `demo@fraudradar.app`
  - Password: `demo123`

## ✨ **Key Features**

### 🔍 **Core Platform Features**
- **Real-time Fraud Map**: Interactive map showing fraud hotspots with live updates
- **Smart Fraud Reporting**: Easy-to-use forms with evidence upload (screenshots, audio)
- **AI-Powered Detection**: Automatic fraud categorization using NLP and pattern recognition
- **Crowd Verification**: Community-driven trust scoring and verification system
- **Instant Alerts**: Real-time notifications for nearby fraud activity
- **Fraud Check Tool**: Quick lookup for phone numbers, emails, and websites

### 🤖 **AI & Intelligence**
- **Auto-categorization** of fraud types (Ponzi, Phishing, Tax Scams, etc.)
- **Risk Scoring** based on content analysis and historical patterns
- **URL Analysis** with VirusTotal and Safe Browsing integration
- **Pattern Recognition** for detecting fraud networks
- **Sentiment Analysis** of fraud reports and messages

### 📱 **User Experience**
- **Mobile-First Design** with PWA support
- **Real-time Notifications** via WebSocket, Email, and SMS
- **Geolocation Integration** for proximity alerts
- **Trust Score System** with reputation management
- **Beautiful UI** with Ant Design and modern animations

### 🔐 **Security & Privacy**
- **JWT Authentication** with secure token management
- **Data Encryption** for sensitive information
- **Rate Limiting** to prevent abuse
- **Input Validation** and sanitization
- **GDPR Compliance** ready architecture

### 📊 **Analytics & Insights**
- **Fraud Trends** analysis and visualization
- **Risk Heatmaps** for geographic insights
- **User Statistics** and leaderboards
- **Export Capabilities** for law enforcement
- **Real-time Dashboards** with key metrics

## 🏗️ **Architecture Overview**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React SPA     │    │  Node.js API    │    │   MongoDB       │
│                 │    │                 │    │                 │
│ • Map Interface │◄──►│ • REST APIs     │◄──►│ • User Data     │
│ • Real-time UI  │    │ • Socket.IO     │    │ • Fraud Reports │
│ • PWA Support   │    │ • AI Services   │    │ • Analytics     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         │              │  External APIs  │              │
         └──────────────┤                 ├──────────────┘
                        │ • Google Maps   │
                        │ • VirusTotal    │
                        │ • Firebase FCM  │
                        │ • Twilio SMS    │
                        └─────────────────┘
```

## 🛠️ **Tech Stack**

### **Backend**
- **Node.js** + **Express.js** - Server framework
- **MongoDB** + **Mongoose** - Database and ODM
- **Socket.IO** - Real-time communications
- **JWT** - Authentication
- **Natural** + **Compromise** - NLP processing
- **Multer** - File upload handling
- **Nodemailer** + **Twilio** - Notifications

### **Frontend**
- **React 18** + **React Router** - UI framework
- **Ant Design** - UI component library
- **Leaflet** + **Google Maps** - Map integration
- **Socket.IO Client** - Real-time updates
- **Framer Motion** - Animations
- **Axios** - HTTP client

### **External Integrations**
- **Google Maps API** - Geocoding and mapping
- **VirusTotal API** - URL safety checking
- **Google Safe Browsing** - Phishing detection
- **Firebase FCM** - Push notifications
- **Twilio** - SMS alerts

## 📦 **Quick Start**

### **Prerequisites**
- Node.js 16+ and npm
- MongoDB 5.0+
- Git

### **1. Clone Repository**
```bash
git clone https://github.com/your-username/fraudradar.git
cd fraudradar
```

### **2. Environment Setup**
```bash
# Copy environment file
cp server/.env.example server/.env

# Edit with your API keys
nano server/.env
```

### **3. Install Dependencies**
```bash
# Install all dependencies (backend + frontend)
npm run install-all
```

### **4. Start MongoDB**
```bash
# Using Docker
docker run -d -p 27017:27017 --name fraudradar-mongo mongo:5.0

# Or use local MongoDB installation
mongod --dbpath ./data/db
```

### **5. Start Development Servers**
```bash
# Start both backend and frontend
npm run dev

# Backend: http://localhost:5000
# Frontend: http://localhost:3000
```

## 🔧 **Configuration**

### **Environment Variables**

Create `server/.env` with your API keys:

```env
# Server
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/fraudradar
JWT_SECRET=your_super_secret_jwt_key

# Google Maps (Required for geocoding)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Optional - Fraud Detection APIs
VIRUSTOTAL_API_KEY=your_virustotal_api_key
GOOGLE_SAFE_BROWSING_API_KEY=your_safe_browsing_api_key

# Optional - Notifications
FIREBASE_PROJECT_ID=your_firebase_project
FIREBASE_PRIVATE_KEY=your_firebase_private_key
FIREBASE_CLIENT_EMAIL=your_firebase_email

TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone

# Optional - Email
EMAIL_HOST=smtp.gmail.com
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password
```

### **Getting API Keys**

1. **Google Maps API**: [Get API Key](https://developers.google.com/maps/documentation/javascript/get-api-key)
2. **VirusTotal**: [Get API Key](https://www.virustotal.com/gui/join-us) (Free tier available)
3. **Firebase**: [Setup Guide](https://firebase.google.com/docs/admin/setup)
4. **Twilio**: [Get Started](https://www.twilio.com/try-twilio) (Free trial)

## 🚀 **Deployment**

### **Production Build**
```bash
# Build frontend
npm run build

# Start production server
npm start
```

### **Docker Deployment**
```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t fraudradar .
docker run -p 5000:5000 fraudradar
```

### **Environment Setup for Production**
```bash
# Set production environment
export NODE_ENV=production
export MONGODB_URI=mongodb://your-mongo-host:27017/fraudradar
export JWT_SECRET=your-production-jwt-secret
# ... add other production environment variables
```

## 🎯 **API Endpoints**

### **Authentication**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile

### **Fraud Reports**
- `GET /api/fraud/reports` - Get fraud reports (with filters)
- `POST /api/fraud/report` - Submit new fraud report
- `GET /api/fraud/reports/:id` - Get single report
- `POST /api/fraud/reports/:id/verify` - Verify report
- `GET /api/fraud/map-data` - Get map visualization data
- `POST /api/fraud/check` - Check if phone/email/website is reported

### **Alerts & Notifications**
- `GET /api/alerts` - Get user alerts
- `PUT /api/alerts/:id/read` - Mark alert as read
- `PUT /api/alerts/read-all` - Mark all alerts as read

### **Analytics**
- `GET /api/analytics/fraud-trends` - Get fraud trends
- `GET /api/analytics/risk-heatmap` - Get risk heatmap data
- `GET /api/analytics/user-stats` - Get platform statistics

## 🎨 **UI Components**

### **Key Components**
- **FraudMap** - Interactive map with fraud hotspots
- **ReportForm** - Multi-step fraud reporting form
- **TrustScoreBadge** - Visual trust score indicator
- **AlertCard** - Real-time alert notifications
- **VerificationPanel** - Crowd verification interface
- **AnalyticsDashboard** - Data visualization

### **Design System**
- **Colors**: Purple gradient primary (#667eea to #764ba2)
- **Typography**: Inter font family
- **Icons**: Ant Design icons + custom emojis
- **Animations**: Framer Motion for smooth transitions

## 📱 **Mobile Features**

- **Progressive Web App** (PWA) support
- **Offline functionality** for viewing reports
- **Push notifications** via service workers
- **Geolocation integration** for automatic location detection
- **Touch-optimized** interface for mobile devices

## 🔒 **Security Features**

- **Rate limiting** on all API endpoints
- **Input validation** and sanitization
- **SQL injection** prevention with Mongoose
- **XSS protection** with Content Security Policy
- **CORS** configuration for secure cross-origin requests
- **JWT token** expiration and refresh
- **Password hashing** with bcrypt

## 📊 **Business Model**

### **Freemium Model**
- **Free**: Basic fraud reporting and alerts
- **Premium**: Advanced analytics, API access, priority support

### **B2B Opportunities**
- **Banks & Fintechs**: Fraud intelligence API
- **Insurance Companies**: Risk assessment data
- **Law Enforcement**: Investigation tools and reports
- **Government Agencies**: Public safety insights

### **Revenue Streams**
1. **API subscriptions** for businesses
2. **Premium user features**
3. **Data licensing** (anonymized)
4. **Custom integrations** and consulting

## 🎯 **Hackathon Demo Script**

### **Live Demo Flow** (5 minutes)
1. **Landing Page** - Show value proposition
2. **Fraud Map** - Demonstrate real-time hotspots
3. **Report Fraud** - Submit a sample scam with AI detection
4. **Real-time Alert** - Show instant notification to other users
5. **Verification** - Demonstrate crowd verification system
6. **Analytics** - Show fraud trends and insights

### **Key Demo Points**
- "Like Google Maps, but for scams"
- Real-time community protection
- AI-powered fraud detection
- Scalable business model
- Social impact and public safety

## 🤝 **Contributing**

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### **Development Workflow**
1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### **Code Standards**
- **ESLint** configuration for code quality
- **Prettier** for code formatting
- **Conventional commits** for commit messages
- **Jest** for testing (unit and integration)

## 🐛 **Troubleshooting**

### **Common Issues**

**MongoDB Connection Error**
```bash
# Check if MongoDB is running
systemctl status mongod

# Start MongoDB
systemctl start mongod
```

**Port Already in Use**
```bash
# Find process using port 5000
lsof -i :5000

# Kill process
kill -9 <PID>
```

**API Key Issues**
- Ensure all required API keys are in `.env`
- Check API key permissions and quotas
- Verify CORS settings for external APIs

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 **Acknowledgments**

- **Ant Design** for the beautiful UI components
- **Leaflet** for the mapping functionality  
- **Natural.js** for NLP processing
- **Socket.IO** for real-time communications
- **MongoDB** for the robust database solution

## 📞 **Contact & Support**

- **Email**: team@fraudradar.app
- **Twitter**: [@FraudRadarApp](https://twitter.com/fraudradarapp)
- **GitHub**: [FraudRadar Issues](https://github.com/your-username/fraudradar/issues)
- **Discord**: [Join our community](https://discord.gg/fraudradar)

---

**Built with ❤️ for safer communities**

*Protect yourself and others from scams with the power of crowdsourced intelligence.*