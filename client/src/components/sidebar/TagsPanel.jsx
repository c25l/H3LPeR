import React from 'react';

const TagsPanel = () => {
  return (
    <div className="tags-panel">
      <div className="tags-header">
        <span className="tags-title">Tags</span>
        <button id="refresh-tags-btn" className="btn btn-icon" title="Refresh tags">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>
      <div id="tags-list" className="tags-list">
        <div className="tags-loading">Loading tags...</div>
      </div>
    </div>
  );
};

export default TagsPanel;
