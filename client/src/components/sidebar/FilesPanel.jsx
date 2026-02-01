import React from 'react';

const FilesPanel = () => {
  return (
    <>
      <div className="file-tree-toolbar">
        <button id="tree-new-file-btn" className="btn btn-icon" title="New file">+F</button>
        <button id="tree-new-folder-btn" className="btn btn-icon" title="New folder">+D</button>
        <button id="tree-rename-btn" className="btn btn-icon" title="Rename">Rename</button>
        <button id="tree-delete-btn" className="btn btn-icon" title="Delete">Delete</button>
        <button id="tree-refresh-btn" className="btn btn-icon" title="Refresh">↻</button>
      </div>
      <div className="file-tree" id="file-tree">
        <div id="file-tree-root">
          {/* File tree will be populated here */}
        </div>
      </div>
    </>
  );
};

export default FilesPanel;
