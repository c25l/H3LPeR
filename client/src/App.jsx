import React, { useState, useEffect } from 'react';
import { AppProvider } from './contexts/AppContext';
import TabNavigation from './components/TabNavigation';
import WriterTab from './components/tabs/WriterTab';
import CalendarTab from './components/tabs/CalendarTab';
import WeatherTab from './components/tabs/WeatherTab';
import NewsTab from './components/tabs/NewsTab';
import ResearchTab from './components/tabs/ResearchTab';
import GoogleAuthBanner from './components/GoogleAuthBanner';

function App() {
  return (
    <AppProvider>
      <div className="app">
        <GoogleAuthBanner />
        <TabNavigation />
        <WriterTab />
        <CalendarTab />
        <WeatherTab />
        <NewsTab />
        <ResearchTab />
      </div>
    </AppProvider>
  );
}

export default App;
