import React from 'react';

const SearchPanel = () => {
  return (
    <div className="search-container">
      <input 
        type="text" 
        id="search-input" 
        placeholder="Search files..." 
        autoComplete="off"
      />
      <div id="search-results" className="search-results hidden"></div>
    </div>
  );
};

export default SearchPanel;
