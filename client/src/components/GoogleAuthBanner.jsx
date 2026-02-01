import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';

const GoogleAuthBanner = () => {
  const { googleAuthStatus } = useAppContext();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (googleAuthStatus && !googleAuthStatus.authenticated) {
      setVisible(true);
      setMessage('Google authentication required for Calendar, Tasks, and Gmail features.');
    }
  }, [googleAuthStatus]);

  if (!visible) return null;

  return (
    <div id="google-auth-banner" className="auth-banner">
      <span id="auth-banner-message">{message}</span>
      <button 
        onClick={() => window.location.href = '/google-setup'} 
        className="btn btn-secondary btn-sm"
      >
        Re-authenticate
      </button>
      <button 
        onClick={() => setVisible(false)} 
        className="btn btn-icon btn-sm"
      >
        &times;
      </button>
    </div>
  );
};

export default GoogleAuthBanner;
