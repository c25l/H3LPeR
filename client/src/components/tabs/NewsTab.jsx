import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';

const NewsTab = () => {
  const { activeTab } = useAppContext();
  const [newsData, setNewsData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeTab === 'news') {
      loadNewsData();
    }
  }, [activeTab]);

  const loadNewsData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/news');
      if (response.ok) {
        const data = await response.json();
        setNewsData(data);
      }
    } catch (error) {
      console.error('Failed to load news data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadNewsData();
  };

  if (activeTab !== 'news') {
    return null;
  }

  return (
    <div className="tab-content active" id="news-tab">
      <div className="helper-tab-container">
        <div className="helper-tab-header">
          <h2>News & Stories</h2>
          <div className="helper-controls">
            <button 
              id="refresh-news" 
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
        <div className="helper-tab-content" id="news-stories">
          {loading ? (
            <div className="loading-spinner"></div>
          ) : newsData ? (
            <div dangerouslySetInnerHTML={{ __html: newsData.html }} />
          ) : (
            <p>Failed to load news data</p>
          )}
        </div>
        <div className="stocks-ticker" id="stocks-ticker">
          {/* Stocks ticker will be populated here */}
        </div>
      </div>
    </div>
  );
};

export default NewsTab;
