import dotenv from 'dotenv'

dotenv.config()

// Check if required environment variables are set
const requiredEnvVars = [
  'AZURE_CLIENT_ID', // Autmomatically used by AzureIdentity SDK
  'AZURE_TENANT_ID', // Autmomatically used by AzureIdentity SDK
  'AZURE_CLIENT_CERTIFICATE_PATH', // Autmomatically used by AzureIdentity SDK
  'SHAREPOINT_TENANT_NAME',
  'ARCHIVE_API_URL',
  'ARCHIVE_API_SCOPE',
  'PDF_API_URL',
  'PDF_API_KEY'
]

const missingEnvVars = []
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    missingEnvVars.push(envVar)
  }
}

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}. See README.md for more information.`)
}

export const SHAREPOINT = {
  TENANT_NAME: process.env.SHAREPOINT_TENANT_NAME,
  REST_API_SCOPE: process.env.SHAREPOINT_REST_API_SCOPE || `https://${process.env.SHAREPOINT_TENANT_NAME}.sharepoint.com/.default`
}

export const GRAPH = {
  API_SCOPE: process.env.GRAPH_API_SCOPE || 'https://graph.microsoft.com/.default',
  API_URL: process.env.GRAPH_API_URL || 'https://graph.microsoft.com/v1.0'
}

export const SMART_CACHE = {
  QUEUE_DIR_NAME: process.env.SMART_CACHE_QUEUE_DIR_NAME || './.smart-archive/queue',
  FAILED_DIR_NAME: process.env.SMART_CACHE_FAILED_DIR_NAME || './.smart-archive/cache',
  FINISHED_DIR_NAME: process.env.SMART_CACHE_FINISHED_DIR_NAME || './.smart-archive/finished'
}

export const ARCHIVE = {
  API_URL: process.env.ARCHIVE_API_URL,
  API_SCOPE: process.env.ARCHIVE_API_SCOPE,
  CASE_EXTERNAL_ID_TYPE: process.env.ARCHIVE_CASE_EXTERNAL_ID_TYPE || 'SMART_MOTEREFERAT',
  DEFAULT_PARAGRAPH: {
    ACCESS_CODE: process.env.ARCHIVE_DEFAULT_PARAGRAPH_ACCESS_CODE || 'U',
    PARAGRAPH: process.env.ARCHIVE_DEFAULT_PARAGRAPH_PARAGRAPH || ''
  }
}

export const PDF = {
  API_URL: process.env.PDF_API_URL,
  API_KEY: process.env.PDF_API_KEY
}
