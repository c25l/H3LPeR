# Azure Deployment Quick Start

This is a condensed version of the deployment guide. For detailed explanations, see [README.md](./README.md).

## Prerequisites
- Azure CLI installed (`az login` completed)
- Docker installed
- GitHub repository with Actions enabled

## Deploy in 9 Steps

### 1. Create Resource Group
```bash
RESOURCE_GROUP="helper-rg"
LOCATION="eastus2"

az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
```

### 2. Deploy Infrastructure
```bash
cd infra
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file main.bicep
```

**Save these output values:**
```bash
az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name main \
  --query properties.outputs -o table
```

### 3. Seed Key Vault Secrets
```bash
# From existing config.json:
./seed-keyvault.sh <key-vault-name> --from-config ../config.json

# OR interactively:
./seed-keyvault.sh <key-vault-name>
```

### 4. Set Claude/AI Environment Variables
```bash
WEB_APP_NAME="<from-step-2-output>"

az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP_NAME" \
  --settings \
    AZURE_AI_ENDPOINT="<your-claude-endpoint>" \
    AZURE_AI_API_KEY="<your-claude-key>" \
    AZURE_AI_DEPLOYMENT_NAME="<your-deployment-name>"
```

### 5. Configure GitHub Actions
```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

# Create service principal
az ad sp create-for-rbac \
  --name "github-helper-deploy" \
  --role Contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"

CLIENT_ID=$(az ad sp list --display-name "github-helper-deploy" --query "[0].appId" -o tsv)

# Create federated credential (replace <your-github-username>/<repo-name>)
az ad app federated-credential create \
  --id "$CLIENT_ID" \
  --parameters '{
    "name": "github-actions",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:<your-github-username>/<repo-name>:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

**Add these to GitHub → Settings → Secrets and variables → Actions → Variables:**
- `AZURE_CLIENT_ID` = (from above)
- `AZURE_TENANT_ID` = (from above)  
- `AZURE_SUBSCRIPTION_ID` = (from above)
- `AZURE_RESOURCE_GROUP` = `helper-rg`

### 6. Build and Push Initial Image
```bash
ACR_NAME="<from-step-2-output>"

az acr login --name "$ACR_NAME"

cd ..
docker build -t "$ACR_NAME.azurecr.io/helper:latest" .
docker push "$ACR_NAME.azurecr.io/helper:latest"
```

### 7. Restart Web App
```bash
az webapp restart \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP_NAME"
```

### 8. Verify Deployment
```bash
APP_URL=$(az webapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP_NAME" \
  --query "defaultHostName" -o tsv)

echo "App URL: https://$APP_URL"
curl "https://$APP_URL/health"
```

### 9. Update Google OAuth Redirect URI
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Add redirect URI: `https://<your-app-url>/auth/google/callback`
3. Update Key Vault:
```bash
az keyvault secret set \
  --vault-name "<key-vault-name>" \
  --name "google-redirect-uri" \
  --value "https://<your-app-url>/auth/google/callback"
```

---

## Quick Commands Reference

### View Logs
```bash
az webapp log tail -g "$RESOURCE_GROUP" -n "$WEB_APP_NAME"
```

### Update Secret
```bash
az keyvault secret set \
  --vault-name "<key-vault-name>" \
  --name "<secret-name>" \
  --value "<new-value>"
az webapp restart -g "$RESOURCE_GROUP" -n "$WEB_APP_NAME"
```

### Delete Everything
```bash
az group delete --name "$RESOURCE_GROUP" --yes
```

### Cost Estimate
~$20-25/month (B1 App Service Plan + Basic ACR + Storage)

---

**Note:** After initial setup, all deployments happen automatically via GitHub Actions when you push to `main`.
