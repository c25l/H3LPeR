import React from 'react';

const CalendarPanel = () => {
  return (
    <div id="calendar-panel" className="calendar-panel">
      <div className="calendar-header">
        <button id="prev-month" className="btn btn-icon">&lt;</button>
        <span id="calendar-title"></span>
        <button id="next-month" className="btn btn-icon">&gt;</button>
      </div>
      <div id="calendar-grid" className="calendar-grid">
        {/* Calendar grid will be populated here */}
      </div>
    </div>
  );
};

export default CalendarPanel;
