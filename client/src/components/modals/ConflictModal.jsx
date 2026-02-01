import React, { useState } from 'react';

const ConflictModal = () => {
  const [visible, setVisible] = useState(false);
  const [localVersion, setLocalVersion] = useState('');
  const [serverVersion, setServerVersion] = useState('');

  const handleResolve = (choice) => {
    // Will be implemented
    setVisible(false);
  };

  return (
    <div id="conflict-modal" className={`modal ${visible ? '' : 'hidden'}`}>
      <div className="modal-content conflict-modal">
        <h3>⚠️ Sync Conflict Detected</h3>
        <p>This file was modified both locally and on the server. Choose which version to keep:</p>
        <div className="conflict-versions">
          <div className="conflict-version">
            <h4>Your Local Version</h4>
            <pre id="conflict-local">{localVersion}</pre>
            <button className="btn btn-primary" onClick={() => handleResolve('local')}>
              Keep Local
            </button>
          </div>
          <div className="conflict-version">
            <h4>Server Version</h4>
            <pre id="conflict-server">{serverVersion}</pre>
            <button className="btn btn-primary" onClick={() => handleResolve('server')}>
              Keep Server
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConflictModal;
