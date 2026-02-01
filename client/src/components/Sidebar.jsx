import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import SearchPanel from './sidebar/SearchPanel';
import RecentPanel from './sidebar/RecentPanel';
import FilesPanel from './sidebar/FilesPanel';
import TagsPanel from './sidebar/TagsPanel';
import CalendarPanel from './sidebar/CalendarPanel';

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [activePanel, setActivePanel] = useState('files');
  const { syncStatus } = useAppContext();

  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const handleNewFile = () => {
    // Will be implemented
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} id="app-sidebar">
      <div className="sidebar-icon-rail" id="icon-rail">
        <div className="icon-rail-top" id="icon-rail-top">
          {/* Icon rail buttons for switching panels */}
          <button 
            className={`icon-rail-btn ${activePanel === 'search' ? 'active' : ''}`}
            onClick={() => setActivePanel('search')}
            title="Search"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
          </button>
          <button 
            className={`icon-rail-btn ${activePanel === 'recent' ? 'active' : ''}`}
            onClick={() => setActivePanel('recent')}
            title="Recent"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </button>
          <button 
            className={`icon-rail-btn ${activePanel === 'files' ? 'active' : ''}`}
            onClick={() => setActivePanel('files')}
            title="Files"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <button 
            className={`icon-rail-btn ${activePanel === 'tags' ? 'active' : ''}`}
            onClick={() => setActivePanel('tags')}
            title="Tags"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
              <line x1="7" y1="7" x2="7.01" y2="7"></line>
            </svg>
          </button>
          <button 
            className={`icon-rail-btn ${activePanel === 'calendar' ? 'active' : ''}`}
            onClick={() => setActivePanel('calendar')}
            title="Calendar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </button>
        </div>
        <div className="icon-rail-bottom" id="icon-rail-bottom">
          <button 
            className="icon-rail-btn" 
            id="sidebar-new-file-btn" 
            title="New File"
            onClick={handleNewFile}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
          </button>
          <button 
            className="icon-rail-btn" 
            id="sidebar-collapse-btn" 
            title="Collapse Sidebar (Ctrl+B)"
            onClick={toggleCollapse}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
        </div>
      </div>
      <div className="sidebar-panel-area" id="sidebar-panels">
        <div className="sidebar-panel-header" id="sidebar-panel-header">
          <span className="sidebar-panel-title" id="sidebar-panel-title">
            {activePanel.charAt(0).toUpperCase() + activePanel.slice(1)}
          </span>
        </div>
        <div className="sidebar-panel-container" id="sidebar-panel-container">
          {activePanel === 'search' && <SearchPanel />}
          {activePanel === 'recent' && <RecentPanel />}
          {activePanel === 'files' && <FilesPanel />}
          {activePanel === 'tags' && <TagsPanel />}
          {activePanel === 'calendar' && <CalendarPanel />}
        </div>
        <div className="sidebar-footer">
          <div id="sync-status" className="sync-status">
            <span className="sync-indicator"></span>
            <span id="sync-text">{syncStatus === 'synced' ? 'Synced' : 'Syncing...'}</span>
          </div>
          <a href="/api/logout" className="btn btn-link">Logout</a>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
