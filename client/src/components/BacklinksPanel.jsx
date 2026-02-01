import React from 'react';

const BacklinksPanel = () => {
  return (
    <div className="backlinks-panel collapsed" id="backlinks-panel">
      <div className="backlinks-header">
        <span className="backlinks-toggle">▶</span>
        <h3>Backlinks</h3>
        <span className="backlinks-count" id="backlinks-count"></span>
      </div>
      <div className="backlinks-content" id="backlinks-list">
        {/* Backlinks will be populated here */}
      </div>
    </div>
  );
};

export default BacklinksPanel;
