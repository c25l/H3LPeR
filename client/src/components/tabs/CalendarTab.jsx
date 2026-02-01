import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';

const CalendarTab = () => {
  const { activeTab } = useAppContext();
  const [calendars, setCalendars] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (activeTab === 'calendar') {
      loadCalendarData();
    }
  }, [activeTab]);

  const loadCalendarData = async () => {
    try {
      const response = await fetch('/api/calendar/events');
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
      }
    } catch (error) {
      console.error('Failed to load calendar data:', error);
    }
  };

  const handleRefresh = () => {
    loadCalendarData();
  };

  if (activeTab !== 'calendar') {
    return null;
  }

  return (
    <div className="tab-content active" id="calendar-tab">
      <div className="calendar-tab-container">
        <div className="calendar-tab-header">
          <h2>Calendar & Tasks</h2>
          <div className="calendar-controls">
            <button 
              id="refresh-calendar" 
              className="btn btn-secondary" 
              title="Refresh"
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
        <div className="calendar-tab-main">
          <aside className="calendar-sidebar">
            <div id="calendar-selector-panel">
              <h3>My Calendars</h3>
              <div id="calendar-list" className="calendar-list">
                {/* Calendar list will be populated here */}
              </div>
            </div>
            <div id="tasks-panel" className="tasks-panel">
              {/* Tasks panel will be populated here */}
            </div>
          </aside>
          <div id="calendar-view" className="calendar-view">
            {/* Calendar view will be rendered here */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarTab;
