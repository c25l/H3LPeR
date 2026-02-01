import React from 'react';
import { useAppContext } from '../contexts/AppContext';

const TabNavigation = () => {
  const { activeTab, setActiveTab } = useAppContext();

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
  };

  return (
    <nav className="tab-nav">
      <button 
        className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
        data-tab="calendar" 
        id="calendar-tab-btn"
        onClick={() => handleTabClick('calendar')}
      >
        Calendar
      </button>
      <button 
        className={`tab-btn ${activeTab === 'writer' ? 'active' : ''}`}
        data-tab="writer"
        onClick={() => handleTabClick('writer')}
      >
        H3LPeR
      </button>
      <button 
        className={`tab-btn ${activeTab === 'weather' ? 'active' : ''}`}
        data-tab="weather" 
        id="weather-tab-btn"
        onClick={() => handleTabClick('weather')}
      >
        Weather
      </button>
      <button 
        className={`tab-btn ${activeTab === 'news' ? 'active' : ''}`}
        data-tab="news" 
        id="news-tab-btn"
        onClick={() => handleTabClick('news')}
      >
        News
      </button>
      <button 
        className={`tab-btn ${activeTab === 'research' ? 'active' : ''}`}
        data-tab="research" 
        id="research-tab-btn"
        onClick={() => handleTabClick('research')}
      >
        Research
      </button>
      <div className="tab-nav-spacer"></div>
      <EmailIndicator />
      <a 
        href="/google-setup" 
        className="btn btn-link btn-sm" 
        style={{ marginRight: '1rem' }} 
        title="Google Integration"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
      </a>
    </nav>
  );
};

const EmailIndicator = () => {
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/gmail/unread-count');
        if (response.ok) {
          const data = await response.json();
          setUnreadCount(data.count || 0);
        }
      } catch (error) {
        console.error('Failed to fetch unread email count:', error);
      }
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(interval);
  }, []);

  return (
    <a 
      href="https://mail.google.com" 
      target="_blank" 
      rel="noopener noreferrer"
      className="btn btn-link btn-sm email-indicator" 
      id="email-indicator" 
      title="Gmail" 
      style={{ marginRight: '0.5rem' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
      </svg>
      {unreadCount > 0 && (
        <span id="unread-count" className="unread-badge">
          {unreadCount}
        </span>
      )}
    </a>
  );
};

export default TabNavigation;
