# Azure Deployment Guide for H3LPeR

This guide walks you through deploying H3LPeR to Azure using the provided infrastructure-as-code templates.

## Prerequisites

1. **Azure CLI** installed and configured
   ```bash
   # Install Azure CLI (if not already installed)
   # macOS:
   brew install azure-cli
   # Windows: Download from https://aka.ms/installazurecliwindows
   # Linux: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-linux
   
   # Login to Azure
   az login
   
   # Set your subscription (if you have multiple)
   az account set --subscription "<your-subscription-id>"
   ```

2. **GitHub repository secrets** configured for CI/CD (see Step 5)

3. **Local configuration file** (`config.json`) with your secrets ready for seeding Key Vault

## Step 1: Create Resource Group

Create a resource group to hold all Azure resources:

```bash
# Choose a unique name and region
RESOURCE_GROUP="helper-rg"
LOCATION="eastus2"

az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"
```

## Step 2: Deploy Infrastructure

Deploy the Bicep template to provision all Azure resources:

```bash
cd infra

# Deploy with default parameters (appName='helper', imageTag='latest')
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file main.bicep

# OR deploy with custom parameters
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file main.bicep \
  --parameters appName=myhelper location=eastus2 imageTag=latest
```

This will create:
- **Azure Container Registry (ACR)** - for storing your Docker images
- **Key Vault** - for securely storing application secrets
- **Storage Account** - with 3 file shares (vault, sessions, data)
- **App Service Plan** - Linux B1 tier
- **App Service (Web App)** - with managed identity and health checks

**Save the output values** - you'll need them in subsequent steps:

```bash
# Capture output values
az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name main \
  --query properties.outputs
```

Note the following outputs:
- `acrName` - Container registry name
- `keyVaultName` - Key Vault name
- `webAppName` - Web app name
- `managedIdentityPrincipalId` - Used for RBAC

## Step 3: Configure Secrets in Key Vault

The app requires several secrets stored in Key Vault. Use the provided seeding script:

### Option A: Import from existing config.json

```bash
# Import secrets from your local config.json
./seed-keyvault.sh <key-vault-name> --from-config ../config.json
```

### Option B: Interactive mode

```bash
# Enter secrets interactively
./seed-keyvault.sh <key-vault-name>
```

The script will prompt for:
- **session-secret** - Random string for cookie signing (generate with `openssl rand -base64 32`)
- **allowed-email** - Your Google email address for login
- **google-client-id** - Google OAuth client ID
- **google-client-secret** - Google OAuth client secret
- **google-redirect-uri** - OAuth redirect URL (e.g., `https://your-app.azurewebsites.net/auth/google/callback`)
- **azure-openai-endpoint** - Azure OpenAI endpoint for embeddings
- **azure-openai-api-key** - Azure OpenAI API key
- **azure-openai-embedding-deployment** - Deployment name (default: `text-embedding-ada-002`)

## Step 4: Configure Additional Environment Variables

Some variables are read directly from App Service environment variables:

```bash
WEB_APP_NAME="<your-web-app-name>"  # From Step 2 output

az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP_NAME" \
  --settings \
    AZURE_AI_ENDPOINT="<claude-api-endpoint>" \
    AZURE_AI_API_KEY="<claude-api-key>" \
    AZURE_AI_DEPLOYMENT_NAME="<claude-deployment-name>"
```

**Optional environment variables:**
```bash
az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP_NAME" \
  --settings \
    DATE_FORMAT="%Y-%m-%d" \
    JOURNAL_FOLDER="Journal/Day"
```

## Step 5: Set Up GitHub Actions CI/CD

Configure GitHub repository variables for automated deployments:

1. **Create an Azure Service Principal with OIDC (recommended)**:

   ```bash
   # Get your subscription and tenant IDs
   SUBSCRIPTION_ID=$(az account show --query id -o tsv)
   TENANT_ID=$(az account show --query tenantId -o tsv)
   
   # Create service principal with Contributor role on the resource group
   az ad sp create-for-rbac \
     --name "github-helper-deploy" \
     --role Contributor \
     --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"
   
   # Get the app (client) ID
   CLIENT_ID=$(az ad sp list --display-name "github-helper-deploy" --query "[0].appId" -o tsv)
   
   # Create federated credential for GitHub Actions
   az ad app federated-credential create \
     --id "$CLIENT_ID" \
     --parameters '{
       "name": "github-actions",
       "issuer": "https://token.actions.githubusercontent.com",
       "subject": "repo:<your-github-username>/<repo-name>:ref:refs/heads/main",
       "audiences": ["api://AzureADTokenExchange"]
     }'
   ```

2. **Configure GitHub repository variables**:

   Go to your GitHub repository → Settings → Secrets and variables → Actions → Variables

   Add the following **Repository variables**:
   - `AZURE_CLIENT_ID` - Client ID from above
   - `AZURE_TENANT_ID` - Tenant ID from above
   - `AZURE_SUBSCRIPTION_ID` - Subscription ID from above
   - `AZURE_RESOURCE_GROUP` - Your resource group name (e.g., `helper-rg`)

## Step 6: Initial Docker Build and Push

Before the GitHub Actions workflow can deploy, you need to push an initial image:

```bash
# Get ACR credentials
ACR_NAME="<your-acr-name>"  # From Step 2 output
az acr login --name "$ACR_NAME"

# Build and push from repository root
cd ..
docker build -t "$ACR_NAME.azurecr.io/helper:latest" .
docker push "$ACR_NAME.azurecr.io/helper:latest"
```

## Step 7: Restart Web App

After pushing the initial image, restart the web app to pull and run it:

```bash
az webapp restart \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP_NAME"
```

## Step 8: Verify Deployment

Check the health endpoint and logs:

```bash
# Get the app URL
APP_URL=$(az webapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP_NAME" \
  --query "defaultHostName" -o tsv)

echo "App URL: https://$APP_URL"

# Test health endpoint
curl "https://$APP_URL/health"
# Should return: {"status":"healthy"}

# View logs
az webapp log tail \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP_NAME"
```

## Step 9: Configure Google OAuth Redirect URI

Update your Google OAuth application with the production redirect URI:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to APIs & Services → Credentials
3. Edit your OAuth 2.0 Client ID
4. Add authorized redirect URI: `https://<your-app-url>/auth/google/callback`
5. Update the `google-redirect-uri` secret in Key Vault:

```bash
az keyvault secret set \
  --vault-name "<key-vault-name>" \
  --name "google-redirect-uri" \
  --value "https://<your-app-url>/auth/google/callback"
```

## Ongoing Operations

### Manual Deployment

Push to `main` branch to trigger automatic deployment via GitHub Actions.

### Viewing Logs

```bash
# Stream logs
az webapp log tail -g "$RESOURCE_GROUP" -n "$WEB_APP_NAME"

# Download logs
az webapp log download -g "$RESOURCE_GROUP" -n "$WEB_APP_NAME"
```

### Updating Secrets

```bash
# Update a Key Vault secret
az keyvault secret set \
  --vault-name "<key-vault-name>" \
  --name "<secret-name>" \
  --value "<new-value>"

# Restart app to reload secrets
az webapp restart -g "$RESOURCE_GROUP" -n "$WEB_APP_NAME"
```

### Scaling

```bash
# Scale up to a larger App Service Plan
az appservice plan update \
  --resource-group "$RESOURCE_GROUP" \
  --name "<app-service-plan-name>" \
  --sku P1V2

# Scale out (add instances)
az appservice plan update \
  --resource-group "$RESOURCE_GROUP" \
  --name "<app-service-plan-name>" \
  --number-of-workers 2
```

### Accessing Azure Files

Your vault data is stored in Azure Files. To access it:

```bash
# Get storage account key
STORAGE_KEY=$(az storage account keys list \
  --resource-group "$RESOURCE_GROUP" \
  --account-name "<storage-account-name>" \
  --query "[0].value" -o tsv)

# List files in vault share
az storage file list \
  --account-name "<storage-account-name>" \
  --account-key "$STORAGE_KEY" \
  --share-name "helper-vault"
```

## Troubleshooting

### Container fails to start

```bash
# Check container logs
az webapp log tail -g "$RESOURCE_GROUP" -n "$WEB_APP_NAME"

# Check if Key Vault access is working
az webapp config appsettings list \
  -g "$RESOURCE_GROUP" \
  -n "$WEB_APP_NAME" \
  --query "[?name=='AZURE_KEYVAULT_URI'].value"
```

### Health check failing

1. Verify the app is listening on port 8080
2. Check if `/health` endpoint returns 200 OK
3. Review application logs for startup errors

### Key Vault access denied

Verify the managed identity has Key Vault Secrets User role:

```bash
# The role assignment is created automatically by Bicep
# To verify:
az role assignment list \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.KeyVault/vaults/<key-vault-name>"
```

### File share not mounted

Check the storage account configuration in Web App:

```bash
az webapp config storage-account list \
  -g "$RESOURCE_GROUP" \
  -n "$WEB_APP_NAME"
```

## Cost Estimates

Approximate monthly costs (East US 2, as of 2024):

- **App Service Plan (B1)**: ~$13/month
- **Container Registry (Basic)**: ~$5/month
- **Key Vault**: ~$0.03/secret/month + operations (~$1/month)
- **Storage Account**: ~$0.50/month (5GB Files + transactions)

**Total**: ~$20-25/month

To minimize costs:
- Use F1 (Free) tier for App Service Plan during development
- Delete resources when not in use: `az group delete -n "$RESOURCE_GROUP" --yes`

## Security Best Practices

1. **Enable Azure AD authentication** for the App Service (in addition to Google OAuth)
2. **Restrict Key Vault network access** to App Service subnet only
3. **Enable diagnostic logs** for audit trails
4. **Regularly rotate secrets** in Key Vault
5. **Review managed identity permissions** periodically
6. **Enable Azure Security Center** recommendations

## Additional Resources

- [Azure App Service docs](https://learn.microsoft.com/en-us/azure/app-service/)
- [Azure Container Registry](https://learn.microsoft.com/en-us/azure/container-registry/)
- [Azure Key Vault](https://learn.microsoft.com/en-us/azure/key-vault/)
- [Bicep language reference](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/)
