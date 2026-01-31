const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const { getPolicyForPath } = require('../services/restrictions');

// Login page (not protected)
router.get('/login', (req, res) => {
  if (req.session.authenticated) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

// All other routes require auth
router.use(authMiddleware);

// Google setup page
router.get('/google-setup', (req, res) => {
  const googleAuth = req.app.locals.googleAuth;
  res.render('google-setup', {
    error: req.query.error || null,
    status: {
      authenticated: googleAuth.isAuthenticated(),
      hasCredentials: googleAuth.hasCredentials(),
      user: googleAuth.getUserInfo()
    }
  });
});

// Main editor page
router.get('/', async (req, res) => {
  try {
    const vault = req.app.locals.vault;

    // Get file tree
    const files = await vault.getTree();

    res.render('editor', {
      files,
      currentFile: null
    });
  } catch (err) {
    res.status(500).render('error', { error: err.message });
  }
});

// Open specific file
router.get('/edit/*', async (req, res) => {
  try {
    const vault = req.app.locals.vault;
    const filePath = req.params[0];

    const file = await vault.readFile(filePath);
    if (file) {
      file.policy = getPolicyForPath(req.app.locals.config, filePath);
    }
    const files = await vault.getTree();

    res.render('editor', {
      files,
      currentFile: file
    });
  } catch (err) {
    res.status(500).render('error', { error: err.message });
  }
});

module.exports = router;
