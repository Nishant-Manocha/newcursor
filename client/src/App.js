import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Spin } from 'antd';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './contexts/AuthContext';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import ErrorBoundary from './components/Common/ErrorBoundary';
import { Helmet } from 'react-helmet';
import './App.css';

// Lazy load components for better performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const FraudMap = lazy(() => import('./pages/FraudMap'));
const ReportFraud = lazy(() => import('./pages/ReportFraud'));
const FraudReports = lazy(() => import('./pages/FraudReports'));
const ReportDetails = lazy(() => import('./pages/ReportDetails'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Profile = lazy(() => import('./pages/Profile'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Login = lazy(() => import('./pages/Auth/Login'));
const Register = lazy(() => import('./pages/Auth/Register'));
const ForgotPassword = lazy(() => import('./pages/Auth/ForgotPassword'));
const Landing = lazy(() => import('./pages/Landing'));
const CheckFraud = lazy(() => import('./pages/CheckFraud'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));

const { Content } = Layout;

// Loading component
const PageLoader = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '400px' 
  }}>
    <Spin size="large" tip="Loading..." />
  </div>
);

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-screen">
          <div className="loading-logo">🛡️</div>
          <div className="loading-text">FraudRadar</div>
          <div className="loading-subtitle">Crowd-Powered Scam Intelligence</div>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="App">
        <Helmet>
          <title>FraudRadar - Crowd-Powered Scam Intelligence</title>
          <meta name="description" content="Real-time fraud detection and reporting platform to protect communities from scams." />
        </Helmet>

        <Layout style={{ minHeight: '100vh' }}>
          <Header />
          
          <Layout>
            {user && <Sidebar />}
            
            <Layout style={{ padding: user ? '24px' : '0' }}>
              <Content
                style={{
                  background: '#fff',
                  borderRadius: user ? '12px' : '0',
                  overflow: 'hidden',
                  boxShadow: user ? '0 4px 12px rgba(0, 0, 0, 0.08)' : 'none'
                }}
              >
                <AnimatePresence mode="wait">
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      {/* Public Routes */}
                      <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
                      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
                      <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <Register />} />
                      <Route path="/forgot-password" element={user ? <Navigate to="/dashboard" /> : <ForgotPassword />} />
                      <Route path="/check" element={<CheckFraud />} />
                      <Route path="/about" element={<About />} />
                      <Route path="/contact" element={<Contact />} />
                      <Route path="/map" element={<FraudMap />} />
                      <Route path="/reports" element={<FraudReports />} />
                      <Route path="/reports/:id" element={<ReportDetails />} />
                      <Route path="/analytics" element={<Analytics />} />

                      {/* Protected Routes */}
                      <Route path="/dashboard" element={
                        <ProtectedRoute>
                          <Dashboard />
                        </ProtectedRoute>
                      } />
                      <Route path="/report" element={
                        <ProtectedRoute>
                          <ReportFraud />
                        </ProtectedRoute>
                      } />
                      <Route path="/alerts" element={
                        <ProtectedRoute>
                          <Alerts />
                        </ProtectedRoute>
                      } />
                      <Route path="/profile" element={
                        <ProtectedRoute>
                          <Profile />
                        </ProtectedRoute>
                      } />

                      {/* 404 Route */}
                      <Route path="*" element={
                        <div style={{ 
                          textAlign: 'center', 
                          padding: '60px 20px',
                          background: '#f8fafc'
                        }}>
                          <h1 style={{ fontSize: '4rem', margin: 0 }}>🔍</h1>
                          <h2 style={{ margin: '20px 0 10px' }}>Page Not Found</h2>
                          <p style={{ color: '#64748b', marginBottom: '30px' }}>
                            The page you're looking for doesn't exist.
                          </p>
                          <button 
                            onClick={() => window.location.href = '/'}
                            style={{
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              color: 'white',
                              border: 'none',
                              padding: '12px 24px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '16px',
                              fontWeight: '500'
                            }}
                          >
                            Go Home
                          </button>
                        </div>
                      } />
                    </Routes>
                  </Suspense>
                </AnimatePresence>
              </Content>
            </Layout>
          </Layout>
        </Layout>
      </div>
    </ErrorBoundary>
  );
}

export default App;