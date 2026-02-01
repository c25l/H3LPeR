import React, { useState, useEffect } from 'react';
import { AppProvider, useAppContext } from './contexts/AppContext';

// Simple functional app that loads and displays actual data
function AppContent() {
  const { activeTab, setActiveTab, dbInitialized } = useAppContext();
  const [fileTree, setFileTree] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [editorContent, setEditorContent] = useState('');
  const [weatherData, setWeatherData] = useState(null);
  const [newsData, setNewsData] = useState(null);
  const [researchData, setResearchData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    try {
      const response = await fetch('/api/files');
      // If we get HTML (redirect to login), we're not authenticated
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        setAuthenticated(true);
        const files = await response.json();
        setFileTree(files);
      } else {
        // Redirect to login if not authenticated
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      window.location.href = '/login';
    } finally {
      setCheckingAuth(false);
    }
  };

  // Load content when tab changes
  useEffect(() => {
    if (authenticated) {
      loadTabContent();
    }
  }, [activeTab, authenticated]);

  const loadFile = async (path) => {
    try {
      const response = await fetch(`/api/files/${path}`);
      if (response.ok) {
        const file = await response.json();
        setCurrentFile(file);
        setEditorContent(file.content || '');
      }
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const saveFile = async () => {
    if (!currentFile) return;
    try {
      const response = await fetch(`/api/files/${currentFile.path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editorContent })
      });
      if (response.ok) {
        alert('File saved!');
      }
    } catch (error) {
      console.error('Failed to save file:', error);
      alert('Failed to save file');
    }
  };

  const loadTabContent = async () => {
    setLoading(true);
    try {
      if (activeTab === 'weather' && !weatherData) {
        const response = await fetch('/api/weather');
        if (response.ok) {
          const data = await response.json();
          setWeatherData(data);
        }
      } else if (activeTab === 'news' && !newsData) {
        const response = await fetch('/api/news');
        if (response.ok) {
          const data = await response.json();
          setNewsData(data);
        }
      } else if (activeTab === 'research' && !researchData) {
        const response = await fetch('/api/research');
        if (response.ok) {
          const data = await response.json();
          setResearchData(data);
        }
      }
    } catch (error) {
      console.error('Failed to load tab content:', error);
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return null; // Will redirect to login
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Simple tab navigation */}
      <nav style={{ 
        display: 'flex', 
        gap: '10px', 
        padding: '10px', 
        borderBottom: '1px solid #ccc', 
        background: '#2d2d2d',
        color: '#fff'
      }}>
        <button 
          onClick={() => setActiveTab('writer')} 
          style={{ 
            padding: '8px 16px', 
            background: activeTab === 'writer' ? '#007acc' : 'transparent',
            color: '#fff',
            border: '1px solid #555',
            cursor: 'pointer',
            borderRadius: '3px'
          }}>
          Writer
        </button>
        <button 
          onClick={() => setActiveTab('weather')} 
          style={{ 
            padding: '8px 16px', 
            background: activeTab === 'weather' ? '#007acc' : 'transparent',
            color: '#fff',
            border: '1px solid #555',
            cursor: 'pointer',
            borderRadius: '3px'
          }}>
          Weather
        </button>
        <button 
          onClick={() => setActiveTab('news')} 
          style={{ 
            padding: '8px 16px', 
            background: activeTab === 'news' ? '#007acc' : 'transparent',
            color: '#fff',
            border: '1px solid #555',
            cursor: 'pointer',
            borderRadius: '3px'
          }}>
          News
        </button>
        <button 
          onClick={() => setActiveTab('research')} 
          style={{ 
            padding: '8px 16px', 
            background: activeTab === 'research' ? '#007acc' : 'transparent',
            color: '#fff',
            border: '1px solid #555',
            cursor: 'pointer',
            borderRadius: '3px'
          }}>
          Research
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <a href="/api/logout" style={{ padding: '8px 16px', color: '#fff', textDecoration: 'none' }}>Logout</a>
        </div>
      </nav>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px', background: '#1e1e1e', color: '#d4d4d4' }}>
        {activeTab === 'writer' && (
          <div style={{ display: 'flex', gap: '20px', height: '100%' }}>
            {/* File list */}
            <div style={{ width: '250px', borderRight: '1px solid #444', paddingRight: '20px', overflowY: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>Files ({fileTree.length})</h3>
              {fileTree.length === 0 ? (
                <p style={{ color: '#888' }}>No files found. Create a .md file in your vault directory.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {fileTree.map(file => (
                    <li 
                      key={file.path} 
                      style={{ 
                        padding: '8px 0', 
                        cursor: 'pointer', 
                        color: currentFile?.path === file.path ? '#569cd6' : '#9cdcfe',
                        borderBottom: '1px solid #333'
                      }}
                      onClick={() => loadFile(file.path)}>
                      📄 {file.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            {/* Editor */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid #444' }}>
                <strong>{currentFile ? currentFile.path : 'No file selected'}</strong>
                {currentFile && (
                  <button 
                    onClick={saveFile} 
                    style={{ 
                      padding: '5px 15px', 
                      background: '#007acc',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}>
                    💾 Save
                  </button>
                )}
              </div>
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                style={{ 
                  flex: 1, 
                  padding: '15px', 
                  fontFamily: 'Consolas, Monaco, monospace', 
                  fontSize: '14px',
                  background: '#1e1e1e',
                  color: '#d4d4d4',
                  border: '1px solid #444',
                  borderRadius: '3px',
                  resize: 'none'
                }}
                placeholder="Select a file to edit or create a new .md file in your vault directory..."
              />
            </div>
          </div>
        )}

        {activeTab === 'weather' && (
          <div>
            <h2>Weather & Space Weather</h2>
            {loading ? (
              <p>Loading weather data...</p>
            ) : weatherData ? (
              <div dangerouslySetInnerHTML={{ __html: weatherData.html || '<pre>' + JSON.stringify(weatherData, null, 2) + '</pre>' }} />
            ) : (
              <p>Weather data will load automatically...</p>
            )}
          </div>
        )}

        {activeTab === 'news' && (
          <div>
            <h2>News & Stories</h2>
            {loading ? (
              <p>Loading news...</p>
            ) : newsData ? (
              <div dangerouslySetInnerHTML={{ __html: newsData.html || '<pre>' + JSON.stringify(newsData, null, 2) + '</pre>' }} />
            ) : (
              <p>News will load automatically...</p>
            )}
          </div>
        )}

        {activeTab === 'research' && (
          <div>
            <h2>Research Papers</h2>
            {loading ? (
              <p>Loading research papers...</p>
            ) : researchData ? (
              <div dangerouslySetInnerHTML={{ __html: researchData.html || '<pre>' + JSON.stringify(researchData, null, 2) + '</pre>' }} />
            ) : (
              <p>Research papers will load automatically...</p>
            )}
          </div>
        )}
      </div>

      {!dbInitialized && (
        <div style={{ 
          position: 'fixed', 
          bottom: '20px', 
          right: '20px', 
          background: '#ff9800', 
          color: '#000',
          padding: '10px 15px', 
          borderRadius: '5px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
        }}>
          Database initializing...
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
