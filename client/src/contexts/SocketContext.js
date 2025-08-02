import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';

// Socket context
const SocketContext = createContext();

// Socket provider component
export const SocketProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const socketRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    if (isAuthenticated && user && !socketRef.current) {
      const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';
      
      const newSocket = io(SOCKET_URL, {
        autoConnect: false,
        forceNew: true,
        transports: ['websocket', 'polling'],
        timeout: 20000,
        auth: {
          userId: user.id
        }
      });

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log('Connected to FraudRadar server');
        setConnected(true);
        
        // Join user-specific room for notifications
        newSocket.emit('join_user_room', user.id);
        
        toast.success('Connected to real-time updates', {
          icon: '🔗',
          duration: 2000
        });
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Disconnected from FraudRadar server:', reason);
        setConnected(false);
        
        if (reason === 'io server disconnect') {
          // Server disconnected, need to reconnect manually
          newSocket.connect();
        }
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setConnected(false);
      });

      // Real-time fraud report updates
      newSocket.on('new_fraud_report', (reportData) => {
        console.log('New fraud report received:', reportData);
        
        // Show notification if user is subscribed to this type
        if (user.preferences?.fraudTypes?.includes(reportData.fraudType) || 
            user.preferences?.fraudTypes?.length === 0) {
          
          const notification = {
            id: Date.now(),
            type: 'new_report',
            title: '🚨 New Fraud Report',
            message: `${reportData.fraudType.toUpperCase()} reported nearby: ${reportData.title}`,
            data: reportData,
            timestamp: new Date(),
            read: false
          };

          setNotifications(prev => [notification, ...prev.slice(0, 49)]); // Keep last 50
          
          toast.error(notification.message, {
            duration: 5000,
            icon: '🚨'
          });
        }
      });

      // Report verification updates
      newSocket.on('report_verified', (verificationData) => {
        console.log('Report verification update:', verificationData);
        
        const notification = {
          id: Date.now(),
          type: 'verification_update',
          title: '✅ Report Verified',
          message: `Trust score updated: ${verificationData.trustScore}%`,
          data: verificationData,
          timestamp: new Date(),
          read: false
        };

        setNotifications(prev => [notification, ...prev.slice(0, 49)]);
      });

      // Personal alerts
      newSocket.on('new_alert', (alertData) => {
        console.log('New alert received:', alertData);
        
        const notification = {
          id: Date.now(),
          type: 'alert',
          title: alertData.title,
          message: alertData.message,
          data: alertData,
          timestamp: new Date(),
          read: false
        };

        setNotifications(prev => [notification, ...prev.slice(0, 49)]);
        
        // Show toast based on severity
        const toastConfig = {
          duration: alertData.severity === 'critical' ? 10000 : 5000,
          style: {
            background: alertData.severity === 'critical' ? '#dc3545' : 
                       alertData.severity === 'high' ? '#fd7e14' : '#ffc107',
            color: 'white'
          }
        };

        toast(alertData.message, toastConfig);
      });

      // High-risk area notifications
      newSocket.on('high_risk_area', (areaData) => {
        console.log('High-risk area alert:', areaData);
        
        toast.error(`⚠️ High fraud activity detected in ${areaData.location}`, {
          duration: 8000
        });
      });

      // System announcements
      newSocket.on('system_announcement', (announcement) => {
        console.log('System announcement:', announcement);
        
        toast(announcement.message, {
          icon: '📢',
          duration: 6000,
          style: {
            background: '#1890ff',
            color: 'white'
          }
        });
      });

      // Store socket reference
      socketRef.current = newSocket;
      setSocket(newSocket);

      // Connect the socket
      newSocket.connect();

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }
  }, [isAuthenticated, user]);

  // Cleanup on logout
  useEffect(() => {
    if (!isAuthenticated && socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      setNotifications([]);
    }
  }, [isAuthenticated]);

  // Join location-based room for proximity alerts
  const joinLocationRoom = (coordinates) => {
    if (socket && connected) {
      socket.emit('join_location_room', coordinates);
      console.log('Joined location room:', coordinates);
    }
  };

  // Leave location-based room
  const leaveLocationRoom = (coordinates) => {
    if (socket && connected) {
      socket.emit('leave_location_room', coordinates);
      console.log('Left location room:', coordinates);
    }
  };

  // Emit fraud report submission
  const emitFraudReport = (reportData) => {
    if (socket && connected) {
      socket.emit('fraud_report_submitted', reportData);
    }
  };

  // Emit verification action
  const emitVerification = (verificationData) => {
    if (socket && connected) {
      socket.emit('verification_submitted', verificationData);
    }
  };

  // Mark notification as read
  const markNotificationRead = (notificationId) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === notificationId 
          ? { ...notif, read: true }
          : notif
      )
    );
  };

  // Mark all notifications as read
  const markAllNotificationsRead = () => {
    setNotifications(prev => 
      prev.map(notif => ({ ...notif, read: true }))
    );
  };

  // Clear notifications
  const clearNotifications = () => {
    setNotifications([]);
  };

  // Get unread notification count
  const getUnreadCount = () => {
    return notifications.filter(notif => !notif.read).length;
  };

  // Context value
  const value = {
    socket,
    connected,
    notifications,
    joinLocationRoom,
    leaveLocationRoom,
    emitFraudReport,
    emitVerification,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    getUnreadCount
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use socket context
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export default SocketContext;