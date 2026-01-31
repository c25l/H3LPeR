/**
 * Azure Key Vault configuration loader.
 *
 * When AZURE_KEYVAULT_URI is set (i.e. running in Azure), secrets are fetched
 * from Key Vault and merged with environment variables to build the config
 * object.  When the env var is absent, falls back to the local config.json
 * loader so local development is unaffected.
 *
 * Secret name mapping (Key Vault name -> config path):
 *   session-secret             -> sessionSecret
 *   allowed-email              -> allowedEmail
 *   google-client-id           -> google.credentials.client_id
 *   google-client-secret       -> google.credentials.client_secret
 *   google-redirect-uri        -> google.credentials.redirect_uri
 *   google-tokens              -> google.tokens  (JSON string)
 *   azure-openai-endpoint      -> azureOpenAI.endpoint
 *   azure-openai-api-key       -> azureOpenAI.apiKey
 *   azure-openai-embedding-deployment -> azureOpenAI.embeddingDeployment
 */

const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const path = require('path');
const fs = require('fs');

const SECRET_NAMES = [
  'session-secret',
  'allowed-email',
  'google-client-id',
  'google-client-secret',
  'google-redirect-uri',
  'google-tokens',
  'azure-openai-endpoint',
  'azure-openai-api-key',
  'azure-openai-embedding-deployment',
];

/**
 * Fetch all known secrets from Key Vault. Returns a Map<name, value>.
 * Missing/disabled secrets are silently skipped.
 */
async function fetchSecrets(vaultUri) {
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(vaultUri, credential);
  const secrets = new Map();

  await Promise.all(
    SECRET_NAMES.map(async (name) => {
      try {
        const secret = await client.getSecret(name);
        if (secret.value) {
          secrets.set(name, secret.value);
        }
      } catch (err) {
        // 404 = secret doesn't exist yet, which is fine
        if (err.statusCode !== 404) {
          console.warn(`Warning: could not read Key Vault secret "${name}": ${err.message}`);
        }
      }
    })
  );

  return secrets;
}

/**
 * Build the config object from Key Vault secrets + environment variables.
 */
function buildConfig(secrets) {
  const vaultPath = process.env.VAULT_PATH || '/mnt/vault';
  const sessionsPath = process.env.SESSIONS_PATH || '/mnt/sessions';
  const dataPath = process.env.DATA_PATH || '/mnt/data';

  // Ensure directories exist
  for (const dir of [vaultPath, sessionsPath, dataPath]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Parse Google tokens if present
  let googleTokens = {};
  const tokensRaw = secrets.get('google-tokens');
  if (tokensRaw) {
    try {
      googleTokens = JSON.parse(tokensRaw);
    } catch {
      console.warn('Warning: could not parse google-tokens secret as JSON');
    }
  }

  return {
    vaultPath: path.resolve(vaultPath),
    port: parseInt(process.env.PORT, 10) || 8080,
    sessionSecret: secrets.get('session-secret') || 'change-me-in-keyvault',
    allowedEmail: secrets.get('allowed-email') || '',
    sessionsPath,
    dataPath,
    dateFormat: process.env.DATE_FORMAT || '%Y-%m-%d',
    journalFolder: process.env.JOURNAL_FOLDER || 'Journal/Day',

    https: {
      enabled: false, // Azure App Service handles TLS termination
    },

    google: {
      credentials: {
        client_id: secrets.get('google-client-id') || '',
        client_secret: secrets.get('google-client-secret') || '',
        redirect_uri: secrets.get('google-redirect-uri') || '',
      },
      tokens: googleTokens,
    },

    azureOpenAI: {
      endpoint: secrets.get('azure-openai-endpoint') || process.env.AZURE_OPENAI_ENDPOINT || '',
      apiKey: secrets.get('azure-openai-api-key') || process.env.AZURE_OPENAI_API_KEY || '',
      embeddingDeployment: secrets.get('azure-openai-embedding-deployment')
        || process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT
        || 'text-embedding-ada-002',
    },

    restrictions: {
      readOnlyPrefixes: [],
      noCreatePrefixes: [],
      noRenamePrefixes: [],
      noDeletePrefixes: [],
      maxLengthByPrefix: {},
    },
  };
}

/**
 * Main loader. Returns a config object compatible with the rest of the app.
 * - In Azure: loads from Key Vault + env vars
 * - Locally:  falls back to config.json via the original config.js loader
 */
async function loadAzureConfig() {
  const vaultUri = process.env.AZURE_KEYVAULT_URI;

  if (!vaultUri) {
    // Not running in Azure - use local config.json
    return require('./config');
  }

  console.log(`Loading configuration from Key Vault: ${vaultUri}`);
  const secrets = await fetchSecrets(vaultUri);
  console.log(`Loaded ${secrets.size} secrets from Key Vault`);

  return buildConfig(secrets);
}

module.exports = { loadAzureConfig };
