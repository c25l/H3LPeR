import React, { useState } from 'react';

const NewFileModal = () => {
  const [visible, setVisible] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleCreate = () => {
    // Will be implemented
    setVisible(false);
    setFileName('');
  };

  const handleClose = () => {
    setVisible(false);
    setFileName('');
  };

  return (
    <div id="new-file-modal" className={`modal ${visible ? '' : 'hidden'}`}>
      <div className="modal-content">
        <h3>New File</h3>
        <input 
          type="text" 
          id="new-file-name" 
          placeholder="filename.md"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
        />
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleCreate}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewFileModal;
