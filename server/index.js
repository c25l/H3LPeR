const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const https = require('https');
const fs = require('fs');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = require('./config');
const { authMiddleware, setupAuth } = require('./auth');
const VaultService = require('./services/vault');
const BacklinksService = require('./services/backlinks');
const JournalService = require('./services/journal');
const GoogleAuthService = require('./auth/google');
const { errorHandler } = require('./middleware/error-handler');
const logger = require('./logger');

const app = express();

// Services
const vault = new VaultService(config.vaultPath);
const backlinks = new BacklinksService(vault);
const journal = new JournalService(vault, config);
const googleAuth = new GoogleAuthService(config, require('./config').configPath);

// Make services available to routes
app.locals.vault = vault;
app.locals.backlinks = backlinks;
app.locals.journal = journal;
app.locals.config = config;
app.locals.googleAuth = googleAuth;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Session
app.use(session({
  store: new FileStore({
    path: path.join(__dirname, '../.sessions'),
    ttl: 7 * 24 * 60 * 60, // 1 week in seconds
    retries: 0
  }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.https?.enabled || false,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
  }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Setup auth routes (login/logout)
setupAuth(app, config);

// Routes
const apiRoutes = require('./routes/api');
const pageRoutes = require('./routes/pages');
const googleApiRoutes = require('./routes/google-api');
const { setupHelperRoutes } = require('./routes/helper-api');
const helperApiRoutes = require('./routes/helper-api');
const EmbeddingsService = require('./services/embeddings');

// Initialize helper services
const embeddingsService = new EmbeddingsService(config);
setupHelperRoutes(config, embeddingsService);

// Google OAuth routes (must be before authMiddleware)
app.get('/api/auth/google/setup', authMiddleware, async (req, res) => {
  try {
    await googleAuth.setupCredentials();
    res.json({ success: true, message: 'Credentials copied successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/google/login', authMiddleware, (req, res) => {
  try {
    const authUrl = googleAuth.generateAuthUrl(req.session);
    res.redirect(authUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/google/callback', authMiddleware, async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.redirect('/google-setup?error=no_code');
    }

    await googleAuth.handleCallback(code, state, req.session);
    res.redirect('/?google_connected=true');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/google-setup?error=' + encodeURIComponent(error.message));
  }
});

app.get('/api/auth/google/logout', authMiddleware, async (req, res) => {
  try {
    await googleAuth.logout();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API routes (protected)
app.use('/api', authMiddleware, apiRoutes);

// Helper API routes (protected)
app.use('/api/helper', authMiddleware, helperApiRoutes);

// Google API routes (protected)
app.use('/api/google', authMiddleware, googleApiRoutes);

// Page routes (protected except login)
app.use('/', pageRoutes);

// Central error handler (must be registered after all routes)
app.use(errorHandler);

// Initialize backlinks index
async function initialize() {
  logger.info('init', 'Building backlinks index...');
  await backlinks.buildIndex();
  logger.info('init', 'Backlinks index ready');

  // Watch for file changes
  vault.watch((event, filePath) => {
    if (event === 'change' || event === 'add') {
      backlinks.updateFile(filePath);
    } else if (event === 'unlink') {
      backlinks.removeFile(filePath);
    }
  });
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
      logger.info('server', `Vault path: ${config.vaultPath}`);
    });
  } else {
    app.listen(PORT, () => {
      logger.info('server', `HTTP Server running at http://localhost:${PORT}`);
      logger.info('server', `Vault path: ${config.vaultPath}`);
    });
  }
}).catch(err => {
  logger.error('server', 'Failed to initialize', err);
  process.exit(1);
});

module.exports = app;
