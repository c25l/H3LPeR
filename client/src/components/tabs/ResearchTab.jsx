import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';

const ResearchTab = () => {
  const { activeTab } = useAppContext();
  const [researchData, setResearchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    if (activeTab === 'research') {
      loadResearchData();
    }
  }, [activeTab, selectedDate]);

  const loadResearchData = async () => {
    setLoading(true);
    try {
      const url = selectedDate 
        ? `/api/research?date=${selectedDate}`
        : '/api/research';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setResearchData(data);
      }
    } catch (error) {
      console.error('Failed to load research data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (activeTab !== 'research') {
    return null;
  }

  return (
    <div className="tab-content active" id="research-tab">
      <div className="helper-tab-container">
        <div className="helper-tab-header">
          <h2>Research Papers</h2>
          <div className="helper-controls">
            <select 
              id="research-date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            >
              <option value="">Today</option>
            </select>
          </div>
        </div>
        <div className="helper-tab-content" id="research-content">
          {loading ? (
            <div className="loading-spinner"></div>
          ) : researchData ? (
            <div dangerouslySetInnerHTML={{ __html: researchData.html }} />
          ) : (
            <p>Failed to load research data</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResearchTab;
