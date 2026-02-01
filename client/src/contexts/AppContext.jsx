import React, { createContext, useContext, useState, useEffect } from 'react';
import db from '../services/db';

const AppContext = createContext();

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  const [fileTree, setFileTree] = useState([]);
  const [activeTab, setActiveTab] = useState('weather');
  const [isDirty, setIsDirty] = useState(false);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [googleAuthStatus, setGoogleAuthStatus] = useState(null);
  const [buffers, setBuffers] = useState([]);
  const [activeBufferId, setActiveBufferId] = useState(null);

  // Initialize IndexedDB
  useEffect(() => {
    const initDb = async () => {
      try {
        await db.init();
        setDbInitialized(true);
        console.log('IndexedDB initialized');

        // Sync from server in background
        db.syncFromServer()
          .then(() => console.log('Initial sync complete'))
          .catch(err => console.error('Sync error:', err));
      } catch (error) {
        console.error('IndexedDB initialization failed:', error);
      }
    };

    initDb();
  }, []);

  // Check Google auth status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/google/status');
        const data = await response.json();
        setGoogleAuthStatus(data);
      } catch (error) {
        console.error('Failed to check Google auth status:', error);
      }
    };

    checkAuth();
  }, []);

  const value = {
    dbInitialized,
    currentFile,
    setCurrentFile,
    fileTree,
    setFileTree,
    activeTab,
    setActiveTab,
    isDirty,
    setIsDirty,
    syncStatus,
    setSyncStatus,
    googleAuthStatus,
    setGoogleAuthStatus,
    buffers,
    setBuffers,
    activeBufferId,
    setActiveBufferId,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
