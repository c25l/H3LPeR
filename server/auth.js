const bcrypt = require('bcryptjs');

// Rate limiting for failed login attempts
const failedAttempts = new Map(); // IP -> { count, nextAllowedTime }

function getRateLimitInfo(ip) {
  return failedAttempts.get(ip) || { count: 0, nextAllowedTime: 0 };
}

function recordFailedAttempt(ip) {
  const info = getRateLimitInfo(ip);
  info.count++;
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 64s (max)
  const delaySeconds = Math.min(Math.pow(2, info.count - 1), 64);
  info.nextAllowedTime = Date.now() + delaySeconds * 1000;
  failedAttempts.set(ip, info);
  return delaySeconds;
}

function clearFailedAttempts(ip) {
  failedAttempts.delete(ip);
}

function isRateLimited(ip) {
  const info = getRateLimitInfo(ip);
  if (info.nextAllowedTime > Date.now()) {
    const waitSeconds = Math.ceil((info.nextAllowedTime - Date.now()) / 1000);
    return waitSeconds;
  }
  return 0;
}

// Auth middleware - checks if user is authenticated via Google
function authMiddleware(req, res, next) {
  const googleAuth = req.app.locals.googleAuth;
  
  // Check if authenticated via session
  if (req.session && req.session.authenticated) {
    const userInfo = req.session.userInfo;
    
    // Check if user's email is allowed
    const allowedEmail = req.app.locals.config.allowedEmail;
    if (allowedEmail && userInfo && userInfo.email !== allowedEmail) {
      req.session.destroy();
      return res.status(403).send('Access denied: Email not authorized');
    }
    
    return next();
  }

  // For API routes, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // For page routes, redirect to login
  res.redirect('/login');
}

// Setup login/logout routes
function setupAuth(app, config) {
  // Google OAuth login
  app.get('/api/login/google', (req, res) => {
    const googleAuth = req.app.locals.googleAuth;
    try {
      const authUrl = googleAuth.generateAuthUrl(req.session);
      // Save session before redirect to ensure state is persisted
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect('/login?error=session_error');
        }
        res.redirect(authUrl);
      });
    } catch (error) {
      res.status(500).send('Google authentication not configured');
    }
  });

  // Simple password login (fallback when Google OAuth is not configured)
  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    // Check rate limiting
    const ip = req.ip;
    const waitSeconds = isRateLimited(ip);
    if (waitSeconds > 0) {
      return res.status(429).json({ 
        error: `Too many failed attempts. Please wait ${waitSeconds} seconds.` 
      });
    }

    // Find user in config
    const user = config.users && config.users.find(u => u.username === username);
    
    if (!user) {
      recordFailedAttempt(ip);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password);
    
    if (!isValid) {
      recordFailedAttempt(ip);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Clear rate limit on successful login
    clearFailedAttempts(ip);

    // Store authentication in session
    req.session.authenticated = true;
    req.session.userInfo = {
      username: user.username,
      name: user.name || user.username
    };

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Session error' });
      }
      res.json({ success: true });
    });
  });

  // Google OAuth callback
  app.get('/api/auth/google/callback', async (req, res) => {
    const googleAuth = req.app.locals.googleAuth;
    try {
      const { code, state } = req.query;

      if (!code) {
        return res.redirect('/login?error=no_code');
      }

      await googleAuth.handleCallback(code, state, req.session);
      
      // Check if user's email is allowed
      const userInfo = googleAuth.getUserInfo();
      const allowedEmail = config.allowedEmail;
      
      if (allowedEmail && userInfo.email !== allowedEmail) {
        await googleAuth.logout();
        return res.redirect('/login?error=unauthorized_email');
      }
      
      // Store authentication in session
      req.session.authenticated = true;
      req.session.userInfo = userInfo;
      
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect('/login?error=session_error');
        }
        console.log('User authenticated:', userInfo.email);
        res.redirect('/');
      });
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect('/login?error=' + encodeURIComponent(error.message));
    }
  });

  // Logout handler
  app.get('/api/logout', async (req, res) => {
    const googleAuth = req.app.locals.googleAuth;
    await googleAuth.logout();
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

module.exports = { authMiddleware, setupAuth, verifyPassword, hashPassword };
