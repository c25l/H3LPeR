// ============================================================================
// H3LPeR - Azure Infrastructure
// Deploys: Resource Group resources including Key Vault, Container Registry,
//          App Service (Linux container), Azure Files for vault storage
// ============================================================================

@description('Base name for all resources (lowercase, no special chars)')
@minLength(3)
@maxLength(16)
param appName string = 'helper'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Container image tag to deploy')
param imageTag string = 'latest'

// ---------- Derived names ----------
var uniqueSuffix = uniqueString(resourceGroup().id)
var acrName = '${appName}acr${uniqueSuffix}'
var kvName = '${appName}-kv-${uniqueSuffix}'
var aspName = '${appName}-plan'
var webAppName = '${appName}-app-${uniqueSuffix}'
var storageName = '${appName}st${uniqueSuffix}'
var fileShareName = 'helper-vault'
var sessionShareName = 'helper-sessions'
var dataShareName = 'helper-data'

// ============================================================================
// Azure Container Registry
// ============================================================================
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// ============================================================================
// Azure Key Vault
// ============================================================================
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
  }
}

// ============================================================================
// Storage Account + File Shares (vault data, sessions, server data)
// ============================================================================
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource vaultShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: fileShareName
  properties: {
    shareQuota: 5 // GB
  }
}

resource sessionsShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: sessionShareName
  properties: {
    shareQuota: 1
  }
}

resource dataShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: dataShareName
  properties: {
    shareQuota: 2
  }
}

// ============================================================================
// App Service Plan (Linux, B1 tier - good starting point)
// ============================================================================
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: aspName
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true // Required for Linux
  }
}

// ============================================================================
// Web App (Linux Container)
// ============================================================================
resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: webAppName
  location: location
  kind: 'app,linux,container'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${acr.properties.loginServer}/${appName}:${imageTag}'
      alwaysOn: true
      healthCheckPath: '/health'
      appSettings: [
        // Container registry
        {
          name: 'DOCKER_REGISTRY_SERVER_URL'
          value: 'https://${acr.properties.loginServer}'
        }
        {
          name: 'DOCKER_REGISTRY_SERVER_USERNAME'
          value: acr.listCredentials().username
        }
        {
          name: 'DOCKER_REGISTRY_SERVER_PASSWORD'
          value: acr.listCredentials().passwords[0].value
        }
        // App configuration
        {
          name: 'WEBSITES_PORT'
          value: '8080'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        // Key Vault URI - the app reads secrets from here
        {
          name: 'AZURE_KEYVAULT_URI'
          value: keyVault.properties.vaultUri
        }
        // File paths (mounted Azure Files)
        {
          name: 'VAULT_PATH'
          value: '/mnt/vault'
        }
        {
          name: 'SESSIONS_PATH'
          value: '/mnt/sessions'
        }
        {
          name: 'DATA_PATH'
          value: '/mnt/data'
        }
      ]
    }
  }
}

// Mount Azure File Shares into the container
resource vaultMount 'Microsoft.Web/sites/config@2023-01-01' = {
  parent: webApp
  name: 'azurestorageaccounts'
  properties: {
    vaultmount: {
      type: 'AzureFiles'
      accountName: storageAccount.name
      shareName: fileShareName
      mountPath: '/mnt/vault'
      accessKey: storageAccount.listKeys().keys[0].value
    }
    sessionsmount: {
      type: 'AzureFiles'
      accountName: storageAccount.name
      shareName: sessionShareName
      mountPath: '/mnt/sessions'
      accessKey: storageAccount.listKeys().keys[0].value
    }
    datamount: {
      type: 'AzureFiles'
      accountName: storageAccount.name
      shareName: dataShareName
      mountPath: '/mnt/data'
      accessKey: storageAccount.listKeys().keys[0].value
    }
  }
}

// ============================================================================
// RBAC: Give the Web App's managed identity access to Key Vault Secrets
// ============================================================================
// Key Vault Secrets User role
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource kvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, webApp.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Outputs
// ============================================================================
output webAppName string = webApp.name
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output storageName string = storageAccount.name
output managedIdentityPrincipalId string = webApp.identity.principalId
