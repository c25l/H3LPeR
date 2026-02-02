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
        // Default to Longmont, CO coordinates if not specified
        const lat = 40.1672;
        const lon = -105.1019;
        const response = await fetch(`/api/helper/weather?lat=${lat}&lon=${lon}`);
        if (response.ok) {
          const data = await response.json();
          setWeatherData(data);
        }
      } else if (activeTab === 'news' && !newsData) {
        const response = await fetch('/api/helper/news');
        if (response.ok) {
          const data = await response.json();
          setNewsData(data);
        }
      } else if (activeTab === 'research' && !researchData) {
        const response = await fetch('/api/helper/research');
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
              <div>
                {weatherData.location && (
                  <div style={{ marginBottom: '15px', color: '#888' }}>
                    <strong>{weatherData.location.name}</strong>
                  </div>
                )}
                
                {weatherData.local?.current && (
                  <div style={{ marginBottom: '20px', padding: '15px', background: '#2d2d2d', borderRadius: '5px' }}>
                    <h3>Current Conditions</h3>
                    {weatherData.local.current.temperature !== null && (
                      <p style={{ fontSize: '1.5em', margin: '10px 0' }}>
                        <strong>{Math.round((weatherData.local.current.temperature * 9/5) + 32)}°F</strong>
                      </p>
                    )}
                    {weatherData.local.current.description && (
                      <p><strong>Conditions:</strong> {weatherData.local.current.description}</p>
                    )}
                    {weatherData.local.current.humidity !== null && (
                      <p><strong>Humidity:</strong> {Math.round(weatherData.local.current.humidity)}%</p>
                    )}
                    {weatherData.local.current.windSpeed !== null && (
                      <p><strong>Wind:</strong> {Math.round(weatherData.local.current.windSpeed * 0.621371)} mph</p>
                    )}
                  </div>
                )}

                {weatherData.local?.forecast && weatherData.local.forecast.length > 0 && (
                  <div style={{ marginBottom: '20px', padding: '15px', background: '#2d2d2d', borderRadius: '5px' }}>
                    <h3>Forecast</h3>
                    {weatherData.local.forecast.slice(0, 3).map((period, idx) => (
                      <div key={idx} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: idx < 2 ? '1px solid #444' : 'none' }}>
                        <h4 style={{ margin: '0 0 5px 0', color: '#569cd6' }}>{period.name}</h4>
                        <p style={{ margin: '5px 0' }}>{period.temperature}°{period.temperatureUnit} - {period.shortForecast}</p>
                        <p style={{ margin: '5px 0', fontSize: '0.9em', color: '#888' }}>Wind: {period.windSpeed} {period.windDirection}</p>
                      </div>
                    ))}
                  </div>
                )}
                
                {weatherData.space && (
                  <div style={{ padding: '15px', background: '#2d2d2d', borderRadius: '5px' }}>
                    <h3>Space Weather</h3>
                    {weatherData.space.solarWind?.speed && (
                      <p><strong>Solar Wind Speed:</strong> {weatherData.space.solarWind.speed} km/s</p>
                    )}
                    {weatherData.space.kIndex !== undefined && (
                      <p><strong>K-Index:</strong> {weatherData.space.kIndex}</p>
                    )}
                    {weatherData.space.solarFlares && weatherData.space.solarFlares.length > 0 && (
                      <p><strong>Recent Solar Flares:</strong> {weatherData.space.solarFlares.length}</p>
                    )}
                  </div>
                )}

                {weatherData.severeAlerts && weatherData.severeAlerts.length > 0 && (
                  <div style={{ marginTop: '20px', padding: '15px', background: '#3d1f1f', borderRadius: '5px', borderLeft: '3px solid #ff6b6b' }}>
                    <h3 style={{ color: '#ff6b6b' }}>⚠️ Severe Weather Alerts</h3>
                    {weatherData.severeAlerts.map((alert, idx) => (
                      <div key={idx} style={{ marginBottom: '10px' }}>
                        <strong>{alert.event}</strong>
                        {alert.headline && <p style={{ fontSize: '0.9em', margin: '5px 0' }}>{alert.headline}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
              <div>
                {newsData.continuingStories && newsData.continuingStories.length > 0 && (
                  <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ borderBottom: '2px solid #007acc', paddingBottom: '10px' }}>Continuing Stories</h3>
                    {newsData.continuingStories.map((story, idx) => {
                      const firstArticle = story.articles && story.articles[0];
                      const storyTitle = firstArticle ? firstArticle.title : (story.summary || `Story ${idx + 1}`);
                      return (
                        <details key={idx} style={{ marginBottom: '15px', padding: '12px', background: '#2d2d2d', borderRadius: '5px', borderLeft: '3px solid #007acc' }}>
                          <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#569cd6', marginBottom: '10px' }}>
                            {storyTitle} ({story.articles?.length || 0} articles)
                          </summary>
                          <div style={{ marginTop: '10px' }}>
                            {story.summary && story.summary !== storyTitle && (
                              <p style={{ fontSize: '0.95em', marginBottom: '10px', color: '#ccc', fontStyle: 'italic' }}>{story.summary}</p>
                            )}
                            {story.articles && story.articles.map((article, aIdx) => (
                              <div key={aIdx} style={{ marginLeft: '15px', marginTop: '8px', paddingLeft: '10px', borderLeft: '2px solid #555' }}>
                                <a href={article.link} target="_blank" rel="noopener noreferrer" style={{ color: '#9cdcfe', textDecoration: 'none' }}>
                                  {article.title}
                                </a>
                                <span style={{ color: '#888', fontSize: '0.85em', marginLeft: '10px' }}>
                                  - {article.source}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
                
                {newsData.newStories && newsData.newStories.length > 0 && (
                  <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ borderBottom: '2px solid #4ec9b0', paddingBottom: '10px' }}>New Stories</h3>
                    {newsData.newStories.map((story, idx) => {
                      const firstArticle = story.articles && story.articles[0];
                      const storyTitle = firstArticle ? firstArticle.title : (story.summary || `Story ${idx + 1}`);
                      return (
                        <details key={idx} style={{ marginBottom: '15px', padding: '12px', background: '#2d2d2d', borderRadius: '5px', borderLeft: '3px solid #4ec9b0' }}>
                          <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#4ec9b0', marginBottom: '10px' }}>
                            {storyTitle} ({story.articles?.length || 0} articles)
                          </summary>
                          <div style={{ marginTop: '10px' }}>
                            {story.summary && story.summary !== storyTitle && (
                              <p style={{ fontSize: '0.95em', marginBottom: '10px', color: '#ccc', fontStyle: 'italic' }}>{story.summary}</p>
                            )}
                            {story.articles && story.articles.map((article, aIdx) => (
                              <div key={aIdx} style={{ marginLeft: '15px', marginTop: '8px', paddingLeft: '10px', borderLeft: '2px solid #555' }}>
                                <a href={article.link} target="_blank" rel="noopener noreferrer" style={{ color: '#9cdcfe', textDecoration: 'none' }}>
                                  {article.title}
                                </a>
                                <span style={{ color: '#888', fontSize: '0.85em', marginLeft: '10px' }}>
                                  - {article.source}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}

                {newsData.techNews && newsData.techNews.length > 0 && (
                  <div>
                    <h3 style={{ borderBottom: '2px solid #c586c0', paddingBottom: '10px' }}>Tech News</h3>
                    {newsData.techNews.slice(0, 10).map((article, idx) => (
                      <div key={idx} style={{ marginBottom: '12px', padding: '10px', background: '#2d2d2d', borderRadius: '5px' }}>
                        <a href={article.link} target="_blank" rel="noopener noreferrer" style={{ color: '#c586c0', textDecoration: 'none', fontSize: '1.02em', fontWeight: '500' }}>
                          {article.title}
                        </a>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.85em', color: '#888' }}>
                          {article.source} {article.date && `- ${new Date(article.date).toLocaleDateString()}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {(!newsData.continuingStories || newsData.continuingStories.length === 0) && 
                 (!newsData.newStories || newsData.newStories.length === 0) && 
                 (!newsData.techNews || newsData.techNews.length === 0) && (
                  <p style={{ color: '#888' }}>No news stories available. News will be fetched on the next refresh cycle.</p>
                )}
              </div>
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
              <div>
                {researchData.papers && researchData.papers.length > 0 ? (
                  researchData.papers.map((paper, idx) => (
                    <div key={idx} style={{ marginBottom: '20px', padding: '15px', background: '#2d2d2d', borderRadius: '5px', borderLeft: '3px solid #ce9178' }}>
                      <h4 style={{ marginTop: 0, color: '#ce9178' }}>
                        <a href={paper.link} target="_blank" rel="noopener noreferrer" style={{ color: '#ce9178', textDecoration: 'none' }}>
                          {paper.title}
                        </a>
                      </h4>
                      {paper.authors && (
                        <p style={{ fontSize: '0.9em', color: '#888', marginBottom: '8px' }}>
                          {paper.authors}
                        </p>
                      )}
                      {paper.summary && (
                        <p style={{ fontSize: '0.95em', lineHeight: '1.5' }}>
                          {paper.summary}
                        </p>
                      )}
                      <p style={{ fontSize: '0.85em', color: '#888', marginTop: '10px' }}>
                        {paper.date ? new Date(paper.date).toLocaleDateString() : 'Recent'} | {paper.category || 'arXiv'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p style={{ color: '#888' }}>No research papers available. Papers will be fetched on the next refresh cycle.</p>
                )}
              </div>
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
