import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';

const WeatherTab = () => {
  const { activeTab } = useAppContext();
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeTab === 'weather') {
      loadWeatherData();
    }
  }, [activeTab]);

  const loadWeatherData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/weather');
      if (response.ok) {
        const data = await response.json();
        setWeatherData(data);
      }
    } catch (error) {
      console.error('Failed to load weather data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadWeatherData();
  };

  if (activeTab !== 'weather') {
    return null;
  }

  return (
    <div className="tab-content active" id="weather-tab">
      <div className="helper-tab-container">
        <div className="helper-tab-header">
          <h2>Weather & Space Weather</h2>
          <div className="helper-controls">
            <button 
              id="refresh-weather" 
              className="btn btn-secondary"
              onClick={handleRefresh}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              Refresh
            </button>
          </div>
        </div>
        <div className="helper-tab-content" id="weather-content">
          {loading ? (
            <div className="loading-spinner"></div>
          ) : weatherData ? (
            <div dangerouslySetInnerHTML={{ __html: weatherData.html }} />
          ) : (
            <p>Failed to load weather data</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeatherTab;
