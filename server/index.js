const express = require('express');
const path = require('path');
const https = require('https');
const fs = require('fs');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = require('./config');
const { errorHandler } = require('./middleware/error-handler');
const logger = require('./logger');

const app = express();

// Simple in-memory whiteboard storage
const whiteboard = {
  content: '# Welcome to the Public Whiteboard\n\nStart typing...',
  lastModified: new Date().toISOString()
};

// Make whiteboard and config available to routes
app.locals.whiteboard = whiteboard;
app.locals.config = config;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Routes
const pageRoutes = require('./routes/pages');
const { setupHelperRoutes } = require('./routes/helper-api');
const helperApiRoutes = require('./routes/helper-api');
const EmbeddingsService = require('./services/embeddings');

// Initialize helper services
const embeddingsService = new EmbeddingsService(config);
setupHelperRoutes(config, embeddingsService);

// Whiteboard API routes
app.get('/api/whiteboard', (req, res) => {
  res.json(whiteboard);
});

app.put('/api/whiteboard', (req, res) => {
  const { content } = req.body;
  if (typeof content === 'string') {
    whiteboard.content = content;
    whiteboard.lastModified = new Date().toISOString();
    res.json({ success: true, lastModified: whiteboard.lastModified });
  } else {
    res.status(400).json({ error: 'Invalid content' });
  }
});

// Helper API routes (now public)
app.use('/api/helper', helperApiRoutes);

// Page routes (now public)
app.use('/', pageRoutes);

// Central error handler (must be registered after all routes)
app.use(errorHandler);

// Initialize
async function initialize() {
  logger.info('init', 'Server initializing...');
  logger.info('init', 'Public whiteboard ready');
}

// Start server
const PORT = config.port || 3000;
const USE_HTTPS = config.https?.enabled || false;

initialize().then(() => {
  if (USE_HTTPS) {
    // Resolve certificate paths relative to project root
    const keyPath = path.isAbsolute(config.https.keyPath) 
      ? config.https.keyPath 
      : path.join(__dirname, '..', config.https.keyPath);
    const certPath = path.isAbsolute(config.https.certPath) 
      ? config.https.certPath 
      : path.join(__dirname, '..', config.https.certPath);

    // Load SSL certificates
    const sslOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };

    https.createServer(sslOptions, app).listen(PORT, () => {
      logger.info('server', `HTTPS Server running at https://localhost:${PORT}`);
    });
  } else {
    app.listen(PORT, () => {
      logger.info('server', `HTTP Server running at http://localhost:${PORT}`);
    });
  }
}).catch(err => {
  logger.error('server', 'Failed to initialize', err);
  process.exit(1);
});

module.exports = app;
