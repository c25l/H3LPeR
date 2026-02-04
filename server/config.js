const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'config.json');

function loadConfig() {
  let config = {
    port: 3000,
    sessionSecret: 'default-secret-change-me'
  };
  
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    config = { ...config, ...JSON.parse(raw) };
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
