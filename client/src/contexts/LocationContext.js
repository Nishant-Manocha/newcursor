import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

// Location context
const LocationContext = createContext();

// Default location (San Francisco)
const DEFAULT_LOCATION = {
  lat: 37.7749,
  lng: -122.4194,
  address: 'San Francisco, CA, USA',
  city: 'San Francisco',
  state: 'California',
  country: 'United States'
};

// Location provider component
export const LocationProvider = ({ children }) => {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('prompt');
  const [watchId, setWatchId] = useState(null);

  // Check geolocation support
  const isGeolocationSupported = () => {
    return 'geolocation' in navigator;
  };

  // Get reverse geocoding information
  const reverseGeocode = async (lat, lng) => {
    try {
      // Use Google Maps Geocoding API if available
      if (window.google && window.google.maps) {
        return new Promise((resolve, reject) => {
          const geocoder = new window.google.maps.Geocoder();
          const latlng = { lat, lng };

          geocoder.geocode({ location: latlng }, (results, status) => {
            if (status === 'OK' && results[0]) {
              const result = results[0];
              const addressComponents = result.address_components;
              
              const getComponent = (type) => {
                const component = addressComponents.find(comp => 
                  comp.types.includes(type)
                );
                return component ? component.long_name : '';
              };

              resolve({
                address: result.formatted_address,
                city: getComponent('locality') || getComponent('administrative_area_level_2'),
                state: getComponent('administrative_area_level_1'),
                country: getComponent('country'),
                zipCode: getComponent('postal_code')
              });
            } else {
              reject(new Error('Geocoding failed'));
            }
          });
        });
      }

      // Fallback to OpenStreetMap Nominatim API
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      );
      
      if (!response.ok) {
        throw new Error('Geocoding API request failed');
      }

      const data = await response.json();
      
      if (data && data.display_name) {
        return {
          address: data.display_name,
          city: data.address?.city || data.address?.town || data.address?.village || '',
          state: data.address?.state || data.address?.region || '',
          country: data.address?.country || '',
          zipCode: data.address?.postcode || ''
        };
      }

      throw new Error('No geocoding results found');
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      
      // Return basic location info if geocoding fails
      return {
        address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        city: '',
        state: '',
        country: '',
        zipCode: ''
      };
    }
  };

  // Get current position
  const getCurrentPosition = useCallback(async (options = {}) => {
    if (!isGeolocationSupported()) {
      const error = 'Geolocation is not supported by this browser';
      setError(error);
      toast.error(error);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000, // 5 minutes
            ...options
          }
        );
      });

      const { latitude, longitude, accuracy } = position.coords;
      
      // Get address information
      const addressInfo = await reverseGeocode(latitude, longitude);
      
      const locationData = {
        lat: latitude,
        lng: longitude,
        accuracy,
        timestamp: new Date(position.timestamp),
        ...addressInfo
      };

      setLocation(locationData);
      setPermissionStatus('granted');
      
      console.log('Location updated:', locationData);
      return locationData;

    } catch (error) {
      console.error('Geolocation error:', error);
      
      let errorMessage = 'Failed to get location';
      
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'Location access denied by user';
          setPermissionStatus('denied');
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Location information unavailable';
          break;
        case error.TIMEOUT:
          errorMessage = 'Location request timed out';
          break;
        default:
          errorMessage = error.message || 'Unknown location error';
      }

      setError(errorMessage);
      
      // Use default location as fallback
      const fallbackLocation = {
        ...DEFAULT_LOCATION,
        timestamp: new Date(),
        fallback: true
      };
      
      setLocation(fallbackLocation);
      toast.error(`${errorMessage}. Using default location.`, {
        duration: 5000
      });
      
      return fallbackLocation;
    } finally {
      setLoading(false);
    }
  }, []);

  // Watch position changes
  const watchPosition = useCallback((options = {}) => {
    if (!isGeolocationSupported()) {
      console.error('Geolocation not supported');
      return null;
    }

    // Clear existing watch
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
    }

    const id = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        
        try {
          const addressInfo = await reverseGeocode(latitude, longitude);
          
          const locationData = {
            lat: latitude,
            lng: longitude,
            accuracy,
            timestamp: new Date(position.timestamp),
            ...addressInfo
          };

          setLocation(locationData);
          console.log('Location updated (watch):', locationData);
        } catch (error) {
          console.error('Error updating watched location:', error);
        }
      },
      (error) => {
        console.error('Watch position error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 600000, // 10 minutes
        ...options
      }
    );

    setWatchId(id);
    return id;
  }, [watchId]);

  // Stop watching position
  const stopWatching = useCallback(() => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      console.log('Stopped watching location');
    }
  }, [watchId]);

  // Set location manually (for user input)
  const setManualLocation = async (coordinates, addressString = null) => {
    setLoading(true);
    
    try {
      let addressInfo = {};
      
      if (addressString) {
        // Use provided address string
        addressInfo = {
          address: addressString,
          city: '',
          state: '',
          country: '',
          zipCode: ''
        };
      } else {
        // Get address from coordinates
        addressInfo = await reverseGeocode(coordinates.lat, coordinates.lng);
      }

      const locationData = {
        lat: coordinates.lat,
        lng: coordinates.lng,
        timestamp: new Date(),
        manual: true,
        ...addressInfo
      };

      setLocation(locationData);
      console.log('Manual location set:', locationData);
      
      return locationData;
    } catch (error) {
      console.error('Error setting manual location:', error);
      setError('Failed to set location');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Check if user is within a certain radius of a location
  const isWithinRadius = (targetLat, targetLng, radiusKm) => {
    if (!location) return false;
    
    const distance = calculateDistance(
      location.lat, 
      location.lng, 
      targetLat, 
      targetLng
    );
    
    return distance <= radiusKm;
  };

  // Get location on component mount
  useEffect(() => {
    if (!location) {
      getCurrentPosition();
    }
  }, [getCurrentPosition, location]);

  // Cleanup watch on unmount
  useEffect(() => {
    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  // Context value
  const value = {
    location,
    loading,
    error,
    permissionStatus,
    isGeolocationSupported: isGeolocationSupported(),
    getCurrentPosition,
    watchPosition,
    stopWatching,
    setManualLocation,
    calculateDistance,
    isWithinRadius,
    reverseGeocode
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
};

// Custom hook to use location context
export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};

export default LocationContext;