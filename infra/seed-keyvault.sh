#!/usr/bin/env bash
# ============================================================================
# Seed Azure Key Vault with secrets required by H3LPeR
# Run this ONCE after deploying infrastructure.
#
# Usage:
#   ./infra/seed-keyvault.sh <key-vault-name>
#
# You can also pass a local config.json to import values from it:
#   ./infra/seed-keyvault.sh <key-vault-name> --from-config path/to/config.json
# ============================================================================
set -euo pipefail

KV_NAME="${1:?Usage: $0 <key-vault-name> [--from-config config.json]}"
FROM_CONFIG=""

shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-config)
      FROM_CONFIG="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

set_secret() {
  local name="$1"
  local value="$2"
  if [[ -n "$value" ]]; then
    echo "  Setting $name..."
    az keyvault secret set --vault-name "$KV_NAME" --name "$name" --value "$value" --output none
  else
    echo "  Skipping $name (empty value)"
  fi
}

echo "Seeding Key Vault: $KV_NAME"
echo ""

if [[ -n "$FROM_CONFIG" ]]; then
  echo "Importing from config file: $FROM_CONFIG"
  echo ""

  # Session secret
  set_secret "session-secret" "$(jq -r '.sessionSecret // empty' "$FROM_CONFIG")"

  # Allowed email
  set_secret "allowed-email" "$(jq -r '.allowedEmail // empty' "$FROM_CONFIG")"

  # Google OAuth
  set_secret "google-client-id" "$(jq -r '.google.credentials.client_id // empty' "$FROM_CONFIG")"
  set_secret "google-client-secret" "$(jq -r '.google.credentials.client_secret // empty' "$FROM_CONFIG")"
  set_secret "google-redirect-uri" "$(jq -r '.google.credentials.redirect_uri // empty' "$FROM_CONFIG")"
  set_secret "google-tokens" "$(jq -c '.google.tokens // empty' "$FROM_CONFIG")"

  # Azure OpenAI (embeddings)
  set_secret "azure-openai-endpoint" "$(jq -r '.azureOpenAI.endpoint // empty' "$FROM_CONFIG")"
  set_secret "azure-openai-api-key" "$(jq -r '.azureOpenAI.apiKey // empty' "$FROM_CONFIG")"
  set_secret "azure-openai-embedding-deployment" "$(jq -r '.azureOpenAI.embeddingDeployment // empty' "$FROM_CONFIG")"

else
  echo "Interactive mode - you'll be prompted for each secret."
  echo "Press Enter to skip any secret you don't have yet."
  echo ""

  read -rp "Session secret (random string for cookie signing): " SESSION_SECRET
  set_secret "session-secret" "$SESSION_SECRET"

  read -rp "Allowed email (Google email for login): " ALLOWED_EMAIL
  set_secret "allowed-email" "$ALLOWED_EMAIL"

  read -rp "Google OAuth client ID: " GOOGLE_CLIENT_ID
  set_secret "google-client-id" "$GOOGLE_CLIENT_ID"

  read -rsp "Google OAuth client secret: " GOOGLE_CLIENT_SECRET
  echo ""
  set_secret "google-client-secret" "$GOOGLE_CLIENT_SECRET"

  read -rp "Google OAuth redirect URI: " GOOGLE_REDIRECT_URI
  set_secret "google-redirect-uri" "$GOOGLE_REDIRECT_URI"

  read -rp "Azure OpenAI endpoint (for embeddings): " AZURE_OAI_ENDPOINT
  set_secret "azure-openai-endpoint" "$AZURE_OAI_ENDPOINT"

  read -rsp "Azure OpenAI API key: " AZURE_OAI_KEY
  echo ""
  set_secret "azure-openai-api-key" "$AZURE_OAI_KEY"

  read -rp "Azure OpenAI embedding deployment name [text-embedding-ada-002]: " AZURE_OAI_DEPLOY
  set_secret "azure-openai-embedding-deployment" "${AZURE_OAI_DEPLOY:-text-embedding-ada-002}"
fi

echo ""
echo "The following secrets should be set as App Service environment variables"
echo "(or added to Key Vault and referenced via app settings):"
echo ""
echo "  AZURE_AI_ENDPOINT       - Claude API endpoint"
echo "  AZURE_AI_API_KEY        - Claude API key"
echo "  AZURE_AI_DEPLOYMENT_NAME - Claude model deployment name"
echo ""
echo "These are read directly from environment variables by the app and can be"
echo "set via: az webapp config appsettings set --name <app> --resource-group <rg> --settings KEY=VALUE"
echo ""
echo "Done."
