const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

class GoogleAuthService {
  constructor(config, configPath) {
    this.config = config;
    this.configPath = configPath;
    this.oauth2Client = null;
    this.initializeClient();
  }

  initializeClient() {
    if (!this.config.google?.credentials) {
      return;
    }

    const { client_id, client_secret, redirect_uri } = this.config.google.credentials;
    this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

    // Set tokens if available
    if (this.config.google?.tokens) {
      this.oauth2Client.setCredentials(this.config.google.tokens);
    }

    // Listen for token refresh
    this.oauth2Client.on('tokens', async (tokens) => {
      console.log('Google tokens refreshed');
      await this.saveTokens(tokens);
    });
  }

  // Copy credentials from H3LPeR
  async setupCredentials(helperPath = '../H3LPeR/credentials.json') {
    try {
      const credPath = path.resolve(__dirname, '../../', helperPath);
      const credData = await fs.readFile(credPath, 'utf-8');
      const credentials = JSON.parse(credData);

      // Support both formats: installed.client_id or web.client_id
      const creds = credentials.installed || credentials.web;
      if (!creds) {
        throw new Error('Invalid credentials.json format');
      }

      // Update config
      if (!this.config.google) {
        this.config.google = {};
      }

      this.config.google.credentials = {
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        redirect_uri: creds.redirect_uris ? creds.redirect_uris[0] : 'http://localhost:8443/api/auth/google/callback'
      };

      // Save to config.json
      await this.saveConfig();

      // Reinitialize client
      this.initializeClient();

      return { success: true };
    } catch (error) {
      console.error('Error setting up Google credentials:', error);
      throw new Error(`Failed to copy credentials: ${error.message}`);
    }
  }

  // Generate authorization URL with CSRF protection
  generateAuthUrl(sessionState) {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized. Run setup first.');
    }

    const state = crypto.randomBytes(32).toString('hex');
    sessionState.oauthState = state;

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: state,
      prompt: 'consent' // Force consent to get refresh token
    });
  }

  // Exchange authorization code for tokens
  async handleCallback(code, state, sessionState) {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    // Verify CSRF state
    if (state !== sessionState.oauthState) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }

    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // Get user info
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();

      // Save tokens and user info
      await this.saveTokens(tokens, userInfo);

      return { success: true, user: userInfo };
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      throw new Error('Failed to authenticate with Google');
    }
  }

  // Save tokens to config.json
  async saveTokens(tokens, userInfo = null) {
    if (!this.config.google) {
      this.config.google = {};
    }

    // Merge tokens (preserve refresh_token if not in new tokens)
    this.config.google.tokens = {
      ...this.config.google.tokens,
      ...tokens
    };

    if (userInfo) {
      this.config.google.user = userInfo;
    }

    await this.saveConfig();
  }

  // Save entire config to file
  async saveConfig() {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  // Revoke tokens and clear config
  async logout() {
    if (this.oauth2Client && this.config.google?.tokens?.access_token) {
      try {
        await this.oauth2Client.revokeCredentials();
      } catch (error) {
        console.error('Error revoking tokens:', error);
      }
    }

    if (this.config.google) {
      delete this.config.google.tokens;
      delete this.config.google.user;
    }

    await this.saveConfig();
    this.oauth2Client = null;
  }

  // Check if authenticated
  isAuthenticated() {
    return !!(this.oauth2Client && this.config.google?.tokens?.access_token);
  }

  // Get authenticated client for API calls
  getClient() {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated with Google');
    }
    return this.oauth2Client;
  }

  // Get user info
  getUserInfo() {
    return this.config.google?.user || null;
  }

  // Check if credentials are configured
  hasCredentials() {
    return !!(this.config.google?.credentials?.client_id);
  }
}

module.exports = GoogleAuthService;
