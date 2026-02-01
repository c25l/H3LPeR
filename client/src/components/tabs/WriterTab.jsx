import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import Sidebar from '../Sidebar';
import Editor from '../Editor';
import BacklinksPanel from '../BacklinksPanel';
import QuickSwitcher from '../modals/QuickSwitcher';
import NewFileModal from '../modals/NewFileModal';
import ConflictModal from '../modals/ConflictModal';

const WriterTab = () => {
  const { activeTab } = useAppContext();

  if (activeTab !== 'writer') {
    return null;
  }

  return (
    <div className="tab-content active" id="writer-tab">
      <div className="app-container">
        <Sidebar />
        <Editor />
        <BacklinksPanel />
        <QuickSwitcher />
        <NewFileModal />
        <ConflictModal />
      </div>
    </div>
  );
};

export default WriterTab;
