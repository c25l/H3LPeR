const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'config.json');

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error('config.json not found. Please create it from config.json.example');
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw);

  // Resolve vault path to absolute
  if (!path.isAbsolute(config.vaultPath)) {
    config.vaultPath = path.resolve(__dirname, '..', config.vaultPath);
  }

  // Ensure vault directory exists
  if (!fs.existsSync(config.vaultPath)) {
    fs.mkdirSync(config.vaultPath, { recursive: true });
  }

  return config;
}

function saveConfig(updatedConfig) {
  // Read raw config to preserve formatting of non-path fields
  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw);

  // Update only specific fields
  if (updatedConfig.passwordHash !== undefined) {
    config.passwordHash = updatedConfig.passwordHash;
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Export both the loaded config and utility functions
module.exports = loadConfig();
module.exports.loadConfig = loadConfig;
module.exports.saveConfig = saveConfig;
module.exports.configPath = configPath;
